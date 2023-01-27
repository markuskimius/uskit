#!/bin/bash

##############################################################################
# BOOTSTRAP
#
# Use python3 or python, whichever is available.
# (See https://unix.stackexchange.com/questions/20880)
#
if "true" : '''\'
then
    exec $(command -v python3 || command -v python) "$0" "$@"
    exit 127
fi
'''


##############################################################################
# PYTHON CODE BEGINS HERE

import uskit
import asyncio

__copyright__ = "Copyright 2022-2023 Mark Kim"
__license__ = "Apache 2.0"
__author__ = "Mark Kim"


##############################################################################
# MAIN

async def main():
    db = await uskit.database("./uchat-db.json", dbfile="./uchat.db", datafiles=["./uchat-db.csv"])
    server = uskit.server()
    login = LoginProxy(db)
    userTxn = uskit.txn_service("./txn_user.json", db)
    chatTxn = uskit.txn_service("./txn_chat.json", db)
    userQuery = uskit.query_service("./query_user.json", db)
    chatQuery = uskit.query_service("./query_chat.json", db)

    # Setup
    server.on("/uchat", login)
    login.on("session", userTxn)
    login.on("session", chatTxn)
    login.on("session", userQuery)
    login.on("session", chatQuery)

    # Listen for connections
    server.listen(8080)

    # Wait forever
    await asyncio.sleep(float("Inf"))


##############################################################################
# LOGIN PROXY

@uskit.service
class LoginProxy:
    def __init__(self, db):
        self.db = db
        self.auth = None
        self.session = None
        self.lastOpen = None
        self.eventManager = uskit.event_manager()

    async def __call__(self, event):
        self.session = event["session"]
        self.session.on("LOGIN", self.__on_login)

    def on(self, type, handler):
        self.session.on(type, self.__on_event)
        self.eventManager.on(type, handler)

    async def __on_event(self, event):
        if   event.get("message") and self.auth : await self.__on_message(event)          # Authenticated message
        elif event.get("message")               : await self.__on_noauth(event)           # Unauthenticated message
        elif event.get("type") == "open"        : self.lastOpen = event                   # Delay open event until authenticated
        else                                    : await self.eventManager.trigger(event)  # Pass through other events

    async def __on_login(self, event):
        username = event["message"].get("CONTENT",{}).get("USER_NAME")
        apikey = event["message"].get("CONTENT",{}).get("API_KEY")
        record = await self.db.get("USER", {
            "USER_NAME" : username,
        })

        if record and record["API_KEY"] == apikey:
            self.auth = record

            await self.session.send({
                "MESSAGE_TYPE" : "LOGIN_ACK",
                "REPLY_TO_ID"  : event["message"].get("MESSAGE_ID"),
                "CONTENT"      : {
                    "USER_NAME" : username,
                },
            })

            # Pass through queued open event to listeners
            if self.lastOpen:
                await self.eventManager.trigger(self.lastOpen)

        else:
            await self.__on_badauth(event)

    async def __on_message(self, event):
        # Add authenticated user
        event = event | {
            "auth" : self.auth,
        }

        await self.eventManager.trigger(event)

    async def __on_noauth(self, event):
        await self.session.send({
            "MESSAGE_TYPE" : "NACK",
            "REPLY_TO_ID"  : event["message"].get("MESSAGE_ID"),
            "ERROR"        : {
                "CODE" : "XAUT",
                "TEXT" : f"Session not authenticated",
            },
        })

    async def __on_badauth(self, event):
        username = event["message"].get("CONTENT",{}).get("USER_NAME")

        # Slow down brute force
        await asyncio.sleep(1)

        await self.session.send({
            "MESSAGE_TYPE" : "LOGIN_NACK",
            "REPLY_TO_ID"  : event["message"].get("MESSAGE_ID"),
            "ERROR"        : {
                "CODE" : "XAUT",
                "TEXT" : f"Authentication of '{username}' failed",
            },
        })

    async def send(self, message):
        if self.auth:
            await self.session.send(message)


##############################################################################
# ENTRY POINT

if __name__ == "__main__":
    asyncio.run(main())


# vim:filetype=python:
