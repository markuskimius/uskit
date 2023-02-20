#!/usr/bin/env python3

import os
import json
import uskit
import asyncio

SCRIPTPATH = os.path.abspath(__file__)
SCRIPTDIR = os.path.dirname(SCRIPTPATH)


async def main():
    db = await uskit.database("./test-db.json", datafiles=["test-db.csv"])
    server = uskit.server()
    testQuery = uskit.query_service(db, "./test-query.json")

    # Setup
    server.on("/regression", lambda event : testQuery.trigger(event))

    # Listen for connections
    server.listen(8080)

    # Wait forever
    await asyncio.sleep(float("Inf"))


os.chdir(SCRIPTDIR)
asyncio.run(main())

