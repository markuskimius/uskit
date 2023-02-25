import json
from . import debug
from . import query
from . import errors
from . import service
from . import expression


##############################################################################
# TXN SERVICE

@service
class TxnService:
    def __init__(self, db, cfg):
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

    async def trigger(self, event):
        type = event["type"]

        if   type == "session" : await self.__on_session(event)
        else                   : debug.debug("Unhandled event", event)

    async def __on_session(self, event):
        self.session = event["session"]

        # Observe messages
        for txnName in self.cfg["operationByTxn"]:
            self.session.on(txnName, self.__on_txn)

    async def check_perm(self, event):
        self.isAllowed = True

        if "allowWhere" in self.cfg:
            allowWhere = self.cfg["allowWhere"]
            qry = query(self.db, allowWhere)

            self.isAllowed = False

            async for row in qry(txn=event):
                self.isAllowed = True

        return self.isAllowed

    async def __on_txn(self, event):
        txn = event.get("message", {})
        txnName = txn.get("MESSAGE_TYPE")
        content = txn.get("CONTENT", {})
        reply = {
            "MESSAGE_TYPE" : f"{txnName}_ACK",
            "REPLY_TO_ID"  : txn.get("MESSAGE_ID"),
        }

        # Permission check
        if self.isAllowed is None:
            await self.check_perm(event)

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
                            dbvalue = txnspec["sourceExpr"](txn=event)
                        elif name in contentRow:
                            dbvalue = contentRow[name]
                        elif txnName in txnspec["requiredBy"]:
                            raise errors.TxnMissingRequired(f"{txnName} requires {name}")
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
                        "ERROR"        : {
                            "CODE" : "XIGN",
                            "TEXT" : f"{nackcount} of {len(records)} transaction(s) ignored.",
                        }
                    })

                else:
                    reply.update({
                        "MESSAGE_TYPE" : f"{txnName}_ACK",
                    })

            except errors.Error as e:
                reply.update({
                    "MESSAGE_TYPE" : f"{txnName}_NACK",
                    "ERROR"        : {
                        "CODE" : e.code,
                        "TEXT" : e.text,
                    }
                })

        else:
            reply.update({
                "MESSAGE_TYPE" : f"{txnName}_NACK",
                "ERROR"        : {
                    "CODE" : "XPRM",
                    "TEXT" : "Transaction not allowed",
                }
            })

        # Reply
        await self.session.send(reply)


##############################################################################
# FACTORY

def txn_service(db, cfgfile):
    """
        Create and return a transaction service object.
    """
    with open(cfgfile) as fd:
        cfg = json.load(fd)

    return TxnService(db, cfg)

