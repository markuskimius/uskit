import os
import json
import asyncio
from . import debug
from . import exceptions
from . import observable
from . import query_accessor


##############################################################################
# QUERY SERVICE

class QueryService:
    def __init__(self, db, queryCfg):
        self.db = db
        self.queryCfg = queryCfg
        self.queryData = QueryData(db, queryCfg)

    async def __call__(self, session):
        return QuerySession(session, self.db, self.queryCfg, self.queryData)


##############################################################################
# QUERY SESSION

class QuerySession:
    """
        Open session from the client to a query service.  Manage any query
        request from the client.
    """

    pid = os.getpid()
    qid = 0

    @staticmethod
    def __nextqid():
        QuerySession.qid += 1

        return f"Q{QuerySession.pid}-{QuerySession.qid}"

    def __init__(self, session, db, queryCfg, queryData):
        self.session = session
        self.db = db
        self.queryCfg = queryCfg
        self.queryData = queryData
        self.queryName = self.queryCfg.get("queryName")
        self.queryInstances = {}

        self.session.addEventObserver("close", self.onClose)
        self.session.addMessageObserver(f"{self.queryName}", self.onQuery)
        self.session.addMessageObserver(f"{self.queryName}_NEXT", self.onQueryNext)

    async def onClose(self):
        tasks = []

        for queryInstance in self.queryInstances.values():
            tasks += [queryInstance.onClose()]

        if tasks:
            await asyncio.gather(*tasks)

        self.queryInstances = {}

    async def onQuery(self, message):
        messageId = message.get("MESSAGE_ID", "0");
        queryId = f"{QuerySession.__nextqid()}|{messageId}"
        queryInstance = QueryInstance(self, self.queryData, self.queryCfg, queryId, self.db)

        self.queryInstances[queryId] = queryInstance

        await queryInstance.onQuery(message)

    async def onQueryNext(self, message):
        queryId = message.get("CONTENT", {}).get("QUERY_ID")

        if queryId in self.queryInstances:
            await self.queryInstances[queryId].onQueryNext(message)
        else:
            await self.session.send({
                "MESSAGE_TYPE" : f"{self.queryName}_NACK",
                "EXCEPTION"    : {
                    "ERROR_CODE" : "XQID",
                    "ERROR_TEXT" : f"Invalid query ID: {queryId}",
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

        self.queryData.addEventObserver("insert", self.onInsert)
        self.queryData.addEventObserver("update", self.onUpdate)
        self.queryData.addEventObserver("delete", self.onDelete)

    async def onClose(self):
        self.queryData.removeEventObserver("insert", self.onInsert)
        self.queryData.removeEventObserver("update", self.onUpdate)
        self.queryData.removeEventObserver("delete", self.onDelete)

    async def onQuery(self, message):
        queryName = self.queryCfg.get("queryName")
        allowQuery = True

        # Permission check
        if "allowWhere" in self.queryCfg:
            allowQuery = False

            async for row in query_accessor.QueryAccessor(self.db, self.queryCfg["allowWhere"])(query=message):
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

            await self.onQueryNext(message)
        else:
            await self.__send({
                "MESSAGE_TYPE" : f"{queryName}_NACK",
                "REPLY_TO_ID"  : message.get("MESSAGE_ID"),
                "EXCEPTION"    : {
                    "ERROR_CODE" : "XPRM",
                    "ERROR_TEXT" : "Query not allowed",
                },
            })

            await self.onClose()

    async def onQueryNext(self, message, **kwargs):
        self.maxcount = message.get("CONTENT", {}).get("MAXCOUNT", self.maxcount)

        async for row in self.queryData.query(lastrow=self.lastrow, maxcount=self.maxcount):
            self.__pushQueue("INSERT", row)
            self.lastrow = row

        await self.__sendQueue(message=message, **kwargs)

    async def onInsert(self, row):
        self.__pushQueue("INSERT", row)
        await self.__sendQueue()

    async def onUpdate(self, row):
        self.__pushQueue("UPDATE", row)
        await self.__sendQueue()

    async def onDelete(self, row):
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
        except exceptions.SessionClosedException as e:
            await self.onClose()


##############################################################################
# QUERY DATA

class QueryData(observable.Observable):
    """
        Store data that a client may request in a format appropriate for a
        query response.
    """

    def __init__(self, db, queryCfg):
        super().__init__()

        self.db = db
        self.query = query_accessor.QueryAccessor(db, queryCfg["joinspec"], queryCfg["fields"])
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
            self.db.addTableEventObserver(table, "insert", self.onTxn)
            self.db.addTableEventObserver(table, "update", self.onTxn)
            self.db.addTableEventObserver(table, "delete", self.onTxn)
            self.db.addTableEventObserver(table, "preinsert", self.onPreTxn)
            self.db.addTableEventObserver(table, "preupdate", self.onPreTxn)
            self.db.addTableEventObserver(table, "predelete", self.onPreTxn)

    async def onPreTxn(self, table, record, **kwargs):
        """
            Before committing a txn, get the list of possible rows that will be
            affected by this txn so we can compare the results after the
            commit.
        """
        rows = await self.__rowsByTable(table, record)
        txnId = kwargs.get("txnId")

        self.rowsByTxnId[txnId] = rows

    async def onTxn(self, table, record, **kwargs):
        """
            After committing a txn, get the list of rows that may have been
            affected by this txn.  Compare them to rows from before the commit
            and notify delta to the observers.
        """
        txnId = kwargs.get("txnId")
        oldrows = self.rowsByTxnId[txnId]
        newrows = await self.__rowsByTable(table, record)
        insert = []
        delete = []
        update = []
        tasks = []

        for rowid,row in oldrows.items():
            if rowid not in newrows:
                tasks += [self.notifyEventObservers(f"delete", row)]

        for rowid,row in newrows.items():
            if rowid not in oldrows:
                tasks += [self.notifyEventObservers(f"insert", row)]
            elif rowid in newrows and oldrows[rowid] != newrows[rowid]:
                tasks += [self.notifyEventObservers(f"update", row)]

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

async def createQueryService(db, cfgfile):
    """
        Create a new query service.
    """
    with open(cfgfile) as fd:
        cfg = json.load(fd)

    return QueryService(db, cfg)

