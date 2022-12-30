#!/usr/bin/env python3

import os
import json
import uskit
import asyncio

SCRIPTPATH = os.path.abspath(__file__)
SCRIPTDIR = os.path.dirname(SCRIPTPATH)
counter = 1
lastrow = None


async def main():
    with open("test_query.json") as fd:
        queryCfg = json.load(fd)

    db = await uskit.createDb("test.db", "test-db.json", ["test-db.csv"])
    query = uskit.Query(db, queryCfg["joinspec"], queryCfg["fields"])
    aquery = uskit.Query(db, queryCfg["allowWhere"])
    admin = { "USER_NAME" : "admin" }
    user = { "USER_NAME" : "Alice" }

    await test(query, "VANILLA")
    await test(query, "MAXCOUNT"         , maxcount=2)
    await test(query, "LASTROW"          , lastrow=lastrow)

    await test(query, "SORT"             , sortfields=["f_USER_ID"])
    await test(query, "SORT + MAXCOUNT"  , sortfields=["f_USER_ID"] , maxcount=2)
    await test(query, "SORT + LASTROW"   , sortfields=["f_USER_ID"] , lastrow=lastrow)

    await test(query, "WHERE"            , where="m.USER_ID=2")
    await test(query, "WHERE + MAXCOUNT" , where="m.USER_ID=2"      , maxcount=1)
    await test(query, "WHERE + LASTROW"  , where="m.USER_ID=2"      , lastrow=lastrow)

    await test(aquery, "AUTH ADMIN"      , login=admin)
    await test(aquery, "AUTH USER"       , login=user)

    await db.close()


async def test(query, name, **kwargs):
    global counter
    global lastrow

    print(f"\n{counter}. {name}")

    async for row in query(**kwargs):
        print(json.dumps(row))
        lastrow = row

    counter += 1


os.chdir(SCRIPTDIR)
asyncio.run(main())

