from . import event_manager


##############################################################################
# FACTORY

def service(ServiceSession):
    class MetaService(type):
        """
            Normally you can't access the static variable of a decorated class.
            Overriding the attribute methods of the decorator class's metaclass
            allows us to access the decorated class's static variables.

            @see https://stackoverflow.com/a/47892880/20025913
        """
        def __getattr__(self, attr):
            return getattr(ServiceSession, attr)

        def __setattr__(self, attr, value):
            return setattr(ServiceSession, attr, value)

    class Service(metaclass=MetaService):
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs
            self.eventManager = event_manager.event_manager()

        async def __call__(self, event):
            instance = ServiceSession(*self.args, **self.kwargs)

            # Instantiate service session
            await instance(event)

            # Let listeners know I'm instantiated
            await self.eventManager.trigger(event | {
                "type"    : "session",
                "session" : instance,
            })

            return instance

        def on(self, type, handler):
            self.eventManager.on(type, handler)

    return Service

