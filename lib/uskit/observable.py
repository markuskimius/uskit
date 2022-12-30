import asyncio


##############################################################################
# Observable

class Observable:
    def __init__(self):
        self.__observersByEventType = {}

    def addEventObserver(self, eventType, observer):
        if eventType not in self.__observersByEventType:
            self.__observersByEventType[eventType] = []

        if observer not in self.__observersByEventType[eventType]:
            self.__observersByEventType[eventType] += [observer]

    def removeEventObserver(self, eventType, observer):
        try:
            observers = self.__observersByEventType.get(eventType, [])
            observers.remove(observer)

            if len(observers) == 0:
                del self.__observersByEventType[eventType]

        except ValueError:
            pass

    async def notifyEventObservers(self, eventType, *args, **kwargs):
        tasks = []

        for observer in self.__observersByEventType.get(eventType, []):
            tasks += [observer(*args, **kwargs)]

        if tasks:
            await asyncio.gather(*tasks)

        return len(tasks)


##############################################################################
# Test Code

if __name__ == "__main__":
    async def main():
        observable = Observable()

        observable.addEventObserver("open", onOpen1)
        observable.addEventObserver("open", onOpen2)
        observable.addEventObserver("close", onClose)

        await observable.notifyEventObservers("open")

    async def onOpen1():
        print("onOpen1 called")

    async def onOpen2():
        print("onOpen2 called")

    async def onClose():
        print("onClose called")

    asyncio.run(main())

