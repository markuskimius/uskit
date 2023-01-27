import os
import json
import asyncio
from . import debug
from . import query
from . import errors
from . import service
from . import event_manager


##############################################################################
# QUERY SERVICE

class QueryService:
    def __init__(self, queryCfg, db):
        self.db = db
        self.queryCfg = queryCfg
        self.queryData = QueryData(db, queryCfg)

    async def __call__(self, event):
        qsession = QuerySession(self.queryCfg, self.db, self.queryData)

        await qsession(event)

        return qsession


##############################################################################
# QUERY SESSION

class QuerySession:
    pid = os.getpid()
    qid = 0

    def nextqid(self):
        QuerySession.qid += 1

        return f"Q{QuerySession.pid}-{QuerySession.qid}"

    def __init__(self, queryCfg, db, queryData):
        self.db = db
        self.queryCfg = queryCfg
        self.queryName = self.queryCfg.get("queryName")
        self.queryInstances = {}
        self.queryData = queryData

    async def __call__(self, event):
        self.session = event["session"]

        self.session.on(f"close", self.__on_close)
        self.session.on(f"{self.queryName}", self.__on_query)
        self.session.on(f"{self.queryName}_NEXT", self.__on_next)

    async def __on_close(self, event):
        tasks = []

        for queryInstance in self.queryInstances.values():
            tasks += [queryInstance.on_close(event)]

        if tasks:
            await asyncio.gather(*tasks)

        self.queryInstances = {}

    async def __on_query(self, event):
        message = event["message"]
        messageId = message.get("MESSAGE_ID", "0");
        queryId = f"{self.nextqid()}|{messageId}"
        queryInstance = QueryInstance(self, self.queryData, self.queryCfg, queryId, self.db)

        self.queryInstances[queryId] = queryInstance

        await queryInstance.on_query(event)

    async def __on_next(self, event):
        message = event["message"]
        queryId = message.get("CONTENT", {}).get("QUERY_ID")

        if queryId in self.queryInstances:
            await self.queryInstances[queryId].__on_next(event)
        else:
            await self.session.send({
                "MESSAGE_TYPE" : f"{self.queryName}_NACK",
                "ERROR"        : {
                    "CODE" : "XQID",
                    "TEXT" : f"Invalid query ID: {queryId}",
                },
            })

    async def send(self, message):
        await self.session.send(message)


##############################################################################
# QUERY INSTANCE

class QueryInstance:
    """
        A client has requested query.  Track the state of the communication
        about this one query from one client.
    """
    STATE_SNAPSHOT = 0x01
    STATE_UPDATE   = 0x02

    def __init__(self, querySession, queryData, queryCfg, queryId, db):
        self.querySession = querySession
        self.queryData = queryData
        self.queryCfg = queryCfg
        self.queryId = queryId
        self.db = db

        self.state = QueryInstance.STATE_SNAPSHOT
        self.maxcount = 500
        self.lastrow = {}
        self.queueByRowId = {}

        self.queryData.on("insert", self.__on_insert)
        self.queryData.on("update", self.__on_update)
        self.queryData.on("delete", self.__on_delete)

    async def on_close(self, event):
        self.queryData.off("insert", self.__on_insert)
        self.queryData.off("update", self.__on_update)
        self.queryData.off("delete", self.__on_delete)

    async def on_query(self, event):
        message = event["message"]
        queryName = self.queryCfg.get("queryName")
        allowQuery = True

        # Permission check
        if "allowWhere" in self.queryCfg:
            allowQuery = False

            async for row in query(self.db, self.queryCfg["allowWhere"])(query=event):
                allowQuery = True
                break

        # Query if permissioned
        if allowQuery:
            await self.__send({
                "MESSAGE_TYPE" : f"{queryName}_ACK",
                "REPLY_TO_ID"  : message.get("MESSAGE_ID"),
                "CONTENT"      : {
                    "QUERY_ID" : self.queryId,
                    "SCHEMA"   : self.queryData.schema,
                },
            })

            await self.__on_next(event)
        else:
            await self.__send({
                "MESSAGE_TYPE" : f"{queryName}_NACK",
                "REPLY_TO_ID"  : message.get("MESSAGE_ID"),
                "ERROR"        : {
                    "CODE" : "XPRM",
                    "TEXT" : "Query not allowed",
                },
            })

            await self.on_close(event)

    async def __on_next(self, event):
        message = event["message"]
        self.maxcount = message.get("CONTENT", {}).get("MAXCOUNT", self.maxcount)

        async for row in self.queryData.query(lastrow=self.lastrow, maxcount=self.maxcount):
            self.__pushQueue("INSERT", row)
            self.lastrow = row

        await self.__sendQueue(message=message)

    async def __on_insert(self, event):
        row = event["row"]
        self.__pushQueue("INSERT", row)
        await self.__sendQueue()

    async def __on_update(self, event):
        row = event["row"]
        self.__pushQueue("UPDATE", row)
        await self.__sendQueue()

    async def __on_delete(self, event):
        row = event["row"]
        self.__pushQueue("DELETE", row)
        await self.__sendQueue()

    def __pushQueue(self, operation, row):
        rowid = row["__rowid__"]

        if rowid in self.queueByRowId:
            (qoperation, qrow) = self.queueByRowId[rowid]

            # Update the buffered row based on the buffered operation and the new operation
            if   qoperation == "INSERT" and operation == "INSERT": self.queueByRowId[rowid] = ("INSERT", row)
            elif qoperation == "INSERT" and operation == "UPDATE": self.queueByRowId[rowid] = ("INSERT", row)
            elif qoperation == "INSERT" and operation == "DELETE": del self.queueByRowId[rowid]
            elif qoperation == "UPDATE" and operation == "INSERT": self.queueByRowId[rowid] = ("UPDATE", row)
            elif qoperation == "UPDATE" and operation == "UPDATE": self.queueByRowId[rowid] = ("UPDATE", row)
            elif qoperation == "UPDATE" and operation == "DELETE": self.queueByRowId[rowid] = ("DELETE", row)
            elif qoperation == "DELETE" and operation == "INSERT": self.queueByRowId[rowid] = ("UPDATE", row)
            elif qoperation == "DELETE" and operation == "UPDATE": self.queueByRowId[rowid] = ("UPDATE", row)
            elif qoperation == "DELETE" and operation == "DELETE": self.queueByRowId[rowid] = ("DELETE", row)
        else:
            self.queueByRowId[rowid] = (operation, row)

    async def __sendQueue(self, **kwargs):
        # A message is sent if the queue has any data, or if this is a snapshot reply
        if self.queueByRowId or QueryInstance.STATE_SNAPSHOT:
            queryName = self.queryCfg.get("queryName")
            count = 0

            # Base message
            queryReply = {
                "MESSAGE_TYPE" : f"{queryName}_{'SNAPSHOT' if self.state == QueryInstance.STATE_SNAPSHOT else 'UPDATE'}",
            }

            # Add REPLY_TO_ID
            if kwargs.get("message"):
                queryReply["REPLY_TO_ID"] = kwargs["message"].get("MESSAGE_ID")

            # Add CONTENT
            queryReply["CONTENT"] = {
                "QUERY_ID" : self.queryId,
            }

            # Add schema
            if kwargs.get("addSchema", False):
                queryReply["CONTENT"]["SCHEMA"] = self.queryData.schema

            # Add queued messages
            for rowid in list(self.queueByRowId.keys()):
                operation, row = self.queueByRowId[rowid]

                if operation not in queryReply["CONTENT"]:
                    queryReply["CONTENT"][operation] = []

                # Remove row from queue to message
                queryReply["CONTENT"][operation] += [row]
                del self.queueByRowId[rowid]
                count += 1

                if count >= self.maxcount:
                    break

            # Add isLast
            if count < self.maxcount:
                queryReply["CONTENT"]["IS_LAST"] = True
                self.state = QueryInstance.STATE_UPDATE
            else:
                queryReply["CONTENT"]["IS_LAST"] = False

            await self.__send(queryReply)

    async def __send(self, message):
        """
            Attempt to send a message over the session.  If the session is
            closed, stop observing and let the garbage collector collect this
            object.
        """

        try:
            await self.querySession.send(message)
        except errors.SessionClosedError as e:
            await self.on_close({
                "type" : "close",
            })


##############################################################################
# QUERY DATA

class QueryData:
    """
        Store data that a client may request in a format appropriate for a
        query response.
    """

    def __init__(self, db, queryCfg):
        super().__init__()

        self.db = db
        self.query = query(db, queryCfg["joinspec"], queryCfg["fields"])
        self.eventManager = event_manager.event_manager()
        self.schema = []
        self.aliasByTable = {}
        self.rowsByTxnId = {}

        # Schema
        for spec in queryCfg["fields"]:
            self.schema += [{
                "name"  : spec["name"],
                "title" : spec["title"],
                "type"  : spec["type"],
            }]

        # Alias mapping
        for spec in queryCfg["joinspec"]:
            alias = spec["alias"]
            table = spec["table"]

            if table not in self.aliasByTable:
                self.aliasByTable[table] = []

            self.aliasByTable[table] += [alias]

        # Observe changes to key tables
        for table in self.aliasByTable.keys():
            self.db.on("insert", table, self.__on_txn)
            self.db.on("update", table, self.__on_txn)
            self.db.on("delete", table, self.__on_txn)
            self.db.on("preinsert", table, self.__on_pretxn)
            self.db.on("preupdate", table, self.__on_pretxn)
            self.db.on("predelete", table, self.__on_pretxn)

    def on(self, type, handler):
        self.eventManager.on(type, handler)

    def off(self, type, handler):
        self.eventManager.off(type, handler)

    async def __on_pretxn(self, event):
        """
            Before committing a txn, get the list of possible rows that will be
            affected by this txn so we can compare the results after the
            commit.
        """
        txnId = event.get("txnId")
        table = event.get("table")
        record = event.get("record")
        rows = await self.__rowsByTable(table, record)

        self.rowsByTxnId[txnId] = rows

    async def __on_txn(self, event):
        """
            After committing a txn, get the list of rows that may have been
            affected by this txn.  Compare them to rows from before the commit
            and notify delta to the observers.
        """
        txnId = event.get("txnId")
        table = event.get("table")
        record = event.get("record")
        oldrows = self.rowsByTxnId[txnId]
        newrows = await self.__rowsByTable(table, record)
        insert = []
        delete = []
        update = []
        tasks = []

        for rowid,row in oldrows.items():
            if rowid not in newrows:
                tasks += [self.eventManager.trigger({
                    "type" : "delete",
                    "row"  : row,
                })]

        for rowid,row in newrows.items():
            if rowid not in oldrows:
                tasks += [self.eventManager.trigger({
                    "type" : "insert",
                    "row"  : row,
                })]
            elif rowid in newrows and oldrows[rowid] != newrows[rowid]:
                tasks += [self.eventManager.trigger({
                    "type" : "update",
                    "row"  : row,
                })]

        if tasks:
            await asyncio.gather(*tasks)

        del self.rowsByTxnId[txnId]

    async def __rowsByTable(self, table, record):
        """
            Return the query result rows that include a record or its absence.
            The return result is keyed by the rowid.
        """
        where = []
        args = []
        rows = {}

        # Filer rules
        for alias in self.aliasByTable[table]:
            awhere = []
            nwhere = []

            for keyfield in self.db.keyfields(table):
                awhere += [ f"{alias}.{keyfield} = ?" ]
                nwhere += [ f"{alias}.{keyfield} is NULL" ]
                args += [ record.get(keyfield, 0) ]

            where += [
                f"( {' and '.join(awhere)} )",
                f"( {' and '.join(nwhere)} )",
            ]

        async for row in self.query(where=" or ".join(where), args=args):
            rowid = row["__rowid__"]
            rows[rowid] = row

        return rows


##############################################################################
# FACTORY

def query_service(cfgfile, db):
    with open(cfgfile) as fd:
        cfg = json.load(fd)

    return QueryService(cfg, db)

