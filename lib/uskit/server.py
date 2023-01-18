import os
import json
import asyncio
import tornado.web
import tornado.websocket
from . import debug
from . import globals
from . import session

__all__ = [
    "Server",
    "createServer",
]


##############################################################################
# SERVER

class Server:
    def __init__(self, **kwargs):
        self.static = kwargs.get("static", "/static")
        self.staticdir = kwargs.get("staticdir", os.path.join(globals.SCRIPTDIR, "static"))
        self.uskit_static = kwargs.get("uskit-static", "/uskit")
        self.uskit_staticdir = kwargs.get("uskit-staticdir", os.path.join(globals.MODULEDIR, "static"))
        self.servicesByPath = {}

    def route(self, path, service):
        if path not in self.servicesByPath:
            self.servicesByPath[path] = []

        self.servicesByPath[path] += [service]

    def listen(self, port, host="localhost"):
        app = tornado.web.Application([
            (f"/()"                     , UrlRedirectHandler           , {"target" : f"{self.static}/"}),
            (f"{self.static}/()"        , tornado.web.StaticFileHandler, {"path" : os.path.join(self.staticdir, "index.html")}),
            (f"{self.static}/(.+)"      , tornado.web.StaticFileHandler, {"path" : self.staticdir}),
            (f"{self.uskit_static}/(.+)", tornado.web.StaticFileHandler, {"path" : self.uskit_staticdir}),
        ])

        debug.info(f"UserStaticPages at {self.static}")
        debug.info(f"UskitStaticPages at {self.uskit_static}")

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
        Used to redirect /index.html to /static/index.html.
    """

    def initialize(self, target):
        self.target = target

    async def get(self, *args, **kwargs):
        self.redirect(self.target)


##############################################################################
# WEBSOCKET HANDLER

class WebSocketHandler(tornado.websocket.WebSocketHandler):
    """
        Used to route JSON messages to services that can handle them.
    """

    def initialize(self, services):
        self.session = session.Session(self)
        self.init_tasks = []

        # Instantiate all services
        for service in services:
            self.init_tasks += [service(self.session)]

    async def open(self):
        if self.init_tasks:
            await asyncio.gather(*self.init_tasks)

        await self.session._onOpen()

    def on_close(self):
        asyncio.create_task(self.session._onClose())

    async def on_message(self, data):
        await self.session._onData(data)


##############################################################################
# FACTORY

async def createServer(*args, **kwargs):
    """
        Create a new server.
    """
    return Server(*args, **kwargs)

