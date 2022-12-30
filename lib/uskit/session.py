import json
import asyncio
from . import util
from . import debug
from . import exceptions
from . import abstract_session
from tornado.websocket import WebSocketClosedError


##############################################################################
# SESSION

class Session(abstract_session.AbstractSession):
    __sessionId = 0

    def __init__(self, wshandler):
        super().__init__(None)

        self.wshandler = wshandler
        self.sessionId = Session.__sessionId

        Session.__sessionId += 1

    async def _onOpen(self):
        debug.info(f"websocket open (sessionId={self.sessionId})")

        await super().notifyEventObservers(self, "open")

    async def _onClose(self):
        debug.info(f"websocket closed (sessionId={self.sessionId})")

        await super().notifyEventObservers(self, "close")

    async def _onData(self, data):
        try:
            message = json.loads(data)

            await self.notifyMessageObservers(message)

        except json.decoder.JSONDecodeError:
            debug.error(f"RX BAD (sessionId={self.sessionId}):", data)

            await self.send({
                "MESSAGE_TYPE" : "NACK",
                "EXCEPTION"    : {
                    "ERROR_CODE" : "XJSN",
                    "ERROR_TEXT" : f"Invalid JSON: '{data}'",
                },
            })

    async def notifyMessageObservers(self, message, *args, **kwargs):
        debug.socket(f"RX (sessionId={self.sessionId}):", json.dumps(message, indent=2, default=str))

        count = await super().notifyMessageObservers(message, *args, **kwargs)

        if count == 0:
            msgtype = message.get("MESSAGE_TYPE")

            await self.send({
                "MESSAGE_TYPE"  : "NACK",
                "REPLY_TO_TYPE" : msgtype,
                "REPLY_TO_ID"   : message.get("MESSAGE_ID"),
                "EXCEPTION"     : {
                    "ERROR_CODE" : "XTYP",
                    "ERROR_TEXT" : f"Unknown message type: '{msgtype}'",
                },
            })

    async def send(self, message):
        message = message.copy()
        message.update({
            "TIMESTAMP" : util.nowstring(),
        })

        try:
            await self.wshandler.write_message(json.dumps(message, default=str))
            debug.socket(f"TX (sessionId={self.sessionId}):", json.dumps(message, indent=2, default=str))
        except WebSocketClosedError as e:
            debug.warning(f"TX FAIL (sessionId={self.sessionId})", json.dumps(message, indent=2, default=str))
            raise exceptions.SessionClosedException(str(e))
        except e:
            raise exceptions.SessionException(str(e))

