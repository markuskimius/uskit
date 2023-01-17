import json
from . import debug
from . import expression
from . import exceptions
from . import observable
from . import query_accessor


##############################################################################
# TXN SERVICE

class TxnService:
    def __init__(self, db, cfg):
        self.db = db
        self.cfg = cfg

    async def __call__(self, session):
        return TxnSession(session, self.db, self.cfg)


##############################################################################
# TXN SESSION

class TxnSession(observable.Observable):
    def __init__(self, session, db, cfg):
        self.session = session
        self.db = db
        self.cfg = cfg
        self.isAllowed = None

        # Rearrange config for faster lookup
        self.specByField = {}

        for field in self.cfg["fields"]:
            txnfield = field["name"]
            dbtable, dbfield = field["target"].split(".")

            self.specByField[txnfield] = {
                "dbtable"    : dbtable,
                "dbfield"    : dbfield,
                "requiredBy" : {}
            }

            if "source" in field:
                self.specByField[txnfield]["sourceExpr"] = expression.Expression(field["source"])

            for txnName in field["requiredBy"]:
                self.specByField[txnfield]["requiredBy"][txnName] = True

        # Observe messages
        for txnName in self.cfg["operationByTxn"] :
            self.session.addMessageObserver(txnName, self.__onTxn)

    async def permissionCheck(self, txn):
        self.isAllowed = True

        if "allowWhere" in self.cfg:
            allowWhere = self.cfg["allowWhere"]
            queryAccessor = query_accessor.QueryAccessor(self.db, allowWhere)

            self.isAllowed = False

            async for row in queryAccessor(txn=txn):
                self.isAllowed = True

        return self.isAllowed

    async def __onTxn(self, txn):
        txnName = txn.get("MESSAGE_TYPE")
        content = txn.get("CONTENT", {})
        reply = {
            "MESSAGE_TYPE" : f"{txnName}_ACK",
            "REPLY_TO_ID"  : txn.get("MESSAGE_ID"),
        }

        # Permission check
        if self.isAllowed is None:
            await self.permissionCheck(txn)

        if self.isAllowed:
            records = []

            try:
                if not isinstance(content, list):
                    content = [content]

                for contentRow in content:
                    recordsByTable = {}

                    # Txn to records
                    for name, txnspec in self.specByField.items():
                        dbtable = txnspec["dbtable"]
                        dbfield = txnspec["dbfield"]

                        if "sourceExpr" in txnspec:
                            dbvalue = txnspec["sourceExpr"](txn=txn)
                        elif name in contentRow:
                            dbvalue = contentRow[name]
                        elif txnName in txnspec["requiredBy"]:
                            raise TxnMissingRequired(f"{txnName} requires {name}")
                        else:
                            continue

                        if dbtable not in recordsByTable:
                            recordsByTable[dbtable] = {}

                        recordsByTable[dbtable][dbfield] = dbvalue

                    # Records need to be a list
                    for dbtable, dbrecord in recordsByTable.items():
                        records += [{
                            "table"     : dbtable,
                            "record"    : dbrecord,
                            "operation" : self.cfg["operationByTxn"][txnName],
                        }]

                # Transact
                results = await self.db.transact(records)
                nackcount = results.count(False)

                if nackcount:
                    reply.update({
                        "MESSAGE_TYPE" : f"{txnName}_NACK",
                        "EXCEPTION"    : {
                            "ERROR_CODE" : "XIGN",
                            "ERROR_TEXT" : f"{nackcount} of {len(records)} transaction(s) ignored.",
                        }
                    })

                else:
                    reply.update({
                        "MESSAGE_TYPE" : f"{txnName}_ACK",
                    })

            except exceptions.UskitException as e:
                reply.update({
                    "MESSAGE_TYPE" : f"{txnName}_NACK",
                    "EXCEPTION"    : {
                        "ERROR_CODE" : e.code,
                        "ERROR_TEXT" : e.text,
                    }
                })

        else:
            reply.update({
                "MESSAGE_TYPE" : f"{txnName}_NACK",
                "EXCEPTION"    : {
                    "ERROR_CODE" : "XPRM",
                    "ERROR_TEXT" : "Transaction not allowed",
                }
            })

        # Reply
        await self.session.send(reply)


##############################################################################
# FACTORY

async def createTxnService(db, cfgfile):
    """
        Create a new transaction service.
    """
    with open(cfgfile) as fd:
        cfg = json.load(fd)

    return TxnService(db, cfg)

