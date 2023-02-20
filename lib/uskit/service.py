from . import event_manager


##############################################################################
# FACTORY

def service(Service):
    class MetaService(type):
        """
            Normally you can't access the static variable of a decorated class.
            Overriding the attribute methods of the decorator class's metaclass
            allows us to access the decorated class's static variables.

            @see https://stackoverflow.com/a/47892880/20025913
        """
        def __getattr__(self, attr):
            return getattr(Service, attr)

        def __setattr__(self, attr, value):
            return setattr(Service, attr, value)

    class ServiceManager(metaclass=MetaService):
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs
            self.eventManager = event_manager.event_manager()

        def on(self, type, handler):
            self.eventManager.on(type, handler)

        async def trigger(self, event):
            type = event["type"]

            if   type == "session" : await self.__on_session(event)
            else                   : debug.debug("Unhandled event", event)

        async def __on_session(self, event):
            instance = Service(*self.args, **self.kwargs)

            # Instantiate service session
            await instance.trigger(event)

            # Let listeners know I'm instantiated
            await self.eventManager.trigger(event | {
                "type"    : "session",
                "session" : instance,
            })

            return instance

    return ServiceManager

