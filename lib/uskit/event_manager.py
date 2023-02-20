import asyncio
from . import debug


##############################################################################
# EventManager

class EventManager:
    def __init__(self):
        self.handlersByType = {}

    def on(self, type, handler):
        if type not in self.handlersByType:
            self.handlersByType[type] = []

        if handler not in self.handlersByType[type]:
            self.handlersByType[type] += [handler]

    def off(self, type, handler):
        try:
            handlers = self.handlersByType.get(type, [])
            handlers.remove(handler)

            if len(handlers) == 0:
                del self.handlersByType[type]

        except ValueError:
            pass

    async def trigger(self, event):
        type = event.get("type")
        tasks = []

        debug.event("trigger", event);

        for handler in self.handlersByType.get(type, []):
            tasks += [handler(event)]

        if tasks:
            await asyncio.gather(*tasks)

        return len(tasks)


##############################################################################
# FACTORY

def event_manager():
    return EventManager()

