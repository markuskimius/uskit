import json
import asyncio
from . import util
from . import debug
from . import errors
from . import event_manager
from tornado.websocket import WebSocketClosedError


##############################################################################
# SESSION

class Session:
    sessionId = 0

    def __init__(self, websocket):
        self.websocket = websocket
        self.sessionId = Session.sessionId
        self.eventManager = event_manager.event_manager()

        Session.sessionId += 1

        self.websocket.on("open", self.__on_open)
        self.websocket.on("close", self.__on_close)
        self.websocket.on("data", self.__on_data)

    def on(self, type, handler):
        self.eventManager.on(type, handler)

    async def __on_open(self, event):
        debug.info(f"websocket open (sessionId={self.sessionId})")

        await self.eventManager.trigger(event)

    async def __on_close(self, event):
        debug.info(f"websocket closed (sessionId={self.sessionId})")

        await self.eventManager.trigger(event)

    async def __on_data(self, event):
        data = event["data"]

        try:
            message = json.loads(data)
            type = message.get("MESSAGE_TYPE")
            debug.socket(f"RX (sessionId={self.sessionId}):", json.dumps(message, indent=2, default=str))

            count = await self.eventManager.trigger({
                "type"    : type,
                "message" : message,
            })

            if count == 0:
                await self.__on_nohandler(message)

        except json.decoder.JSONDecodeError:
            debug.error(f"RX BAD (sessionId={self.sessionId}):", data)
            await self.__on_baddata(event)

    async def __on_baddata(self, event):
        data = event["data"]

        await self.send({
            "MESSAGE_TYPE" : "NACK",
            "ERROR"        : {
                "CODE" : "XJSN",
                "TEXT" : f"Invalid JSON: '{data}'",
            },
        })

    async def __on_nohandler(self, message):
        type = message.get("MESSAGE_TYPE")

        await self.send({
            "MESSAGE_TYPE"  : "NACK",
            "REPLY_TO_TYPE" : type,
            "REPLY_TO_ID"   : message.get("MESSAGE_ID"),
            "ERROR"         : {
                "CODE" : "XTYP",
                "TEXT" : f"Unknown message type: '{type}'",
            },
        })

    async def send(self, message):
        message = message | {
            "TIMESTAMP" : util.nowstring(),
        }

        try:
            await self.websocket.write_message(json.dumps(message, default=str))
            debug.socket(f"TX (sessionId={self.sessionId}):", json.dumps(message, indent=2, default=str))
        except WebSocketClosedError as e:
            debug.warning(f"TX FAIL (sessionId={self.sessionId})", json.dumps(message, indent=2, default=str))
            raise errors.SessionClosedError(str(e))
        except e:
            raise errors.SessionError(str(e))


##############################################################################
# FACTORY

def session(websocket):
    return Session(websocket)

