#!/usr/bin/env python3

import os
import uskit
import asyncio

SCRIPTPATH = os.path.abspath(__file__)
SCRIPTDIR = os.path.dirname(SCRIPTPATH)


async def main():
    server = uskit.server()
    service = Service()

    server.on("/regression", service)

    # Listen for connections
    server.listen(8080)

    # Wait forever
    await asyncio.sleep(float("Inf"))


@uskit.service
class Service:
    async def __call__(self, event):
        print("call", event)


os.chdir(SCRIPTDIR)
asyncio.run(main())

