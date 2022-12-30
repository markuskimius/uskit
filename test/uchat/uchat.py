#!/bin/sh

##############################################################################
# BOOTSTRAP
#
# Include ../../lib in the search path so we can find termwriter when running locally
# then call python3 or python, whichever exists.
# (See https://unix.stackexchange.com/questions/20880)
#
if "true" : '''\'
then
    # export PYTHONPATH="$(dirname $0)/../../lib:$PYTHONPATH"
    pythoncmd=python

    if command -v python3 >/dev/null; then
        pythoncmd=python3
    fi

    exec "$pythoncmd" "$0" "$@"
    exit 127
fi
'''

##############################################################################
# PYTHON CODE BEGINS HERE

__copyright__ = "Copyright 2022-2023 Mark Kim"
__license__ = "Apache 2.0"
__version__ = "0.0.1"
__author__ = "Mark Kim"

import sys
import json
import uskit
import asyncio
from copy import deepcopy


##############################################################################
# MAIN

async def main():
    db = await uskit.createDatabaseAccessor("./uchat-db.json", "./uchat.db", datafiles=["./uchat-db.csv"])
    server = await uskit.createServer()
    loginService = LoginService(db)
    userTxnService = await uskit.createTxnService(db, "./txn_user.json")
    chatTxnService = await uskit.createTxnService(db, "./txn_chat.json")
    userQueryService = await uskit.createQueryService(db, "./query_user.json")
    chatQueryService = await uskit.createQueryService(db, "./query_chat.json")

    # Setup
    server.route("/uchat", loginService)
    loginService.addEventObserver("session", userTxnService)
    loginService.addEventObserver("session", chatTxnService)
    loginService.addEventObserver("session", userQueryService)
    loginService.addEventObserver("session", chatQueryService)

    # Listen for connections
    server.listen(8080)

    # Wait forever
    await asyncio.sleep(float("Inf"))


##############################################################################
# LOGIN SERVICE

class LoginService(uskit.AbstractService):
    def __init__(self, db):
        super().__init__()

        self.db = db

    async def __call__(self, session):
        loginSession = LoginSession(session, self.db)

        return await super().__call__(loginSession)


class LoginSession(uskit.AbstractSession):
    def __init__(self, session, db):
        super().__init__(session)

        self.db = db
        self.authuser = None
        self.session = session

        self.session.addMessageObserver("LOGIN", self.onLoginRequest)

    async def onLoginRequest(self, message):
        username = message.get("CONTENT",{}).get("USER_NAME")
        apikey = message.get("CONTENT",{}).get("API_KEY")
        record = await self.db.get("USER", {
            "USER_NAME" : username,
        })

        if record and record["API_KEY"] == apikey:
            self.authuser = record

            await self.session.send({
                "MESSAGE_TYPE" : "LOGIN_ACK",
                "CONTENT"      : {
                    "USER_NAME" : username,
                },
            })

        else:
            # Slow down brute force guessing rate
            await asyncio.sleep(1)

            await self.session.send({
                "MESSAGE_TYPE" : "LOGIN_NACK",
                "EXCEPTION"    : {
                    "ERROR_CODE" : "XAUT",
                    "ERROR_TEXT" : f"Authentication of '{username}' failed",
                },
            })

    def addEventObserver(self, eventType, observer):
        # Events pass to the observers directly
        self.session.addEventObserver(eventType, observer)

    async def notifyEventObservers(self, eventType, *args, **kwargs):
        # Events pass to the observers directly
        await self.session.notifyEventObservers(eventType, *args, **kwargs)

    def addMessageObserver(self, messageType, observer):
        # Subscribe to this message type from the parent session
        self.session.addMessageObserver(messageType, self.onMessage)

        # Remember this observer to be notified later by super().notifyMessageObserver()
        super().addMessageObserver(messageType, observer)

    async def onMessage(self, message):
        """
            Notify the observers waiting for this message if the session is
            authenticated; otherwise reject the message.
        """

        if self.authuser:
            message = deepcopy(message)

            # Add authenticated user information to the message
            message.update({
                "USER_ID"   : self.authuser["USER_ID"],
                "USER_NAME" : self.authuser["USER_NAME"],
            })

            await super().notifyMessageObservers(message)

        else:
            await self.send({
                "MESSAGE_TYPE" : "NACK",
                "EXCEPTION"    : {
                    "ERROR_CODE" : "XAUT",
                    "ERROR_TEXT" : f"Session not authenticated",
                },
            })


##############################################################################
# ENTRY POINT

if __name__ == "__main__":
    asyncio.run(main())


# vim:filetype=python:
