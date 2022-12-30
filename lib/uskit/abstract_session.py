import asyncio
from .observable import Observable


##############################################################################
# ABSTRACT SESSION

class AbstractSession(Observable):
    def __init__(self, session):
        super().__init__()

        self.__session = session

    def isOpen(self):
        return self.__session.isOpen()

    def addMessageObserver(self, messageType, observer):
        super().addEventObserver(f"message|{messageType}", observer)

    async def notifyMessageObservers(self, message, *args, **kwargs):
        messageType = message.get("MESSAGE_TYPE")

        return await super().notifyEventObservers(f"message|{messageType}", message, *args, **kwargs)

    async def send(self, *args, **kwargs):
        await self.__session.send(*args, **kwargs)

