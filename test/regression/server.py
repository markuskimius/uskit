#!/usr/bin/env python3

import os
import uskit
import asyncio

SCRIPTPATH = os.path.abspath(__file__)
SCRIPTDIR = os.path.dirname(SCRIPTPATH)


async def main():
    server = uskit.server()
    service = Service()

    server.on("/regression", lambda event : service.trigger(event))

    # Listen for connections
    server.listen(8080)

    # Wait forever
    await asyncio.sleep(float("Inf"))


@uskit.service
class Service:
    async def trigger(self, event):
        print("trigger", event)


os.chdir(SCRIPTDIR)
asyncio.run(main())

