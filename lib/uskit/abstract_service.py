import asyncio
from .observable import Observable


##############################################################################
# ABSTRACT SERVICE

class AbstractService(Observable):
    def __init__(self):
        super().__init__()

    async def __call__(self, session):
        await super().notifyEventObservers("session", session)

        return session

