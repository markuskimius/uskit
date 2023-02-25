import os
import asyncio
import tornado.web
import tornado.websocket
from . import util
from . import debug
from . import session
from . import event_manager


##############################################################################
# SERVER

class Server:
    def __init__(self, **kwargs):
        self.static = kwargs.get("static", "/static")
        self.staticdir = kwargs.get("staticdir", os.path.join(util.SCRIPTDIR, "static"))
        self.uskitStatic = kwargs.get("uskit-static", "/uskit")
        self.uskitStaticdir = kwargs.get("uskit-staticdir", os.path.join(util.MODULEDIR, "static"))
        self.servicesByPath = {}

    def on(self, path, service):
        if path not in self.servicesByPath:
            self.servicesByPath[path] = []

        self.servicesByPath[path] += [service]

    def listen(self, port, host="localhost"):
        app = tornado.web.Application([
            (f"/()"                    , UrlRedirectHandler           , {"target" : f"{self.static}/"}),
            (f"{self.static}/()"       , tornado.web.StaticFileHandler, {"path" : os.path.join(self.staticdir, "index.html")}),
            (f"{self.static}/(.+)"     , tornado.web.StaticFileHandler, {"path" : self.staticdir}),
            (f"{self.uskitStatic}/(.+)", tornado.web.StaticFileHandler, {"path" : self.uskitStaticdir}),
        ])

        debug.info(f"UserStaticPages at {self.static}")
        debug.info(f"UskitStaticPages at {self.uskitStatic}")

        # Add service routes
        for path, services in self.servicesByPath.items():
            debug.info(f"WebSocketHandler at {path}")

            app.add_handlers(".*", [
                (path, WebSocketHandler, { "services": services })
            ])

        debug.info(f"Listening on {host}:{port}")
        app.listen(port, host)


##############################################################################
# URL REDIRECT HANDLER

class UrlRedirectHandler(tornado.web.RequestHandler):
    """
        Redirect /index.html to /static/index.html.
    """
    def initialize(self, target):
        self.target = target

    async def get(self, *args, **kwargs):
        self.redirect(self.target)


##############################################################################
# WEBSOCKET HANDLER

class WebSocketHandler(tornado.websocket.WebSocketHandler):
    """
        Route JSON messages to services that can handle them.
    """
    def initialize(self, services):
        self.eventManager = event_manager.event_manager()
        self.session = session.session(self)
        self.init_tasks = []
        event = {
            "type"    : "session",
            "session" : self.session,
        }

        # Instantiate all services
        for service in services:
            self.init_tasks += [service(event)]

    def on(self, type, handler):
        self.eventManager.on(type, handler)

    async def open(self):
        await asyncio.gather(*self.init_tasks)
        await self.eventManager.trigger({
            "type" : "open",
        })

    def on_close(self):
        asyncio.create_task(self.eventManager.trigger({
            "type" : "close",
        }))

    async def on_message(self, data):
        await self.eventManager.trigger({
            "type" : "data",
            "data" : data,
        })


##############################################################################
# FACTORY

def server(**kwargs):
    """
        Create and return a uskit server object.
    """
    return Server(**kwargs)

