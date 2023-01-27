#!/usr/bin/env python3

import os
import uskit
import asyncio

SCRIPTPATH = os.path.abspath(__file__)
SCRIPTDIR = os.path.dirname(SCRIPTPATH)


async def main():
    db = await uskit.database()

    await db.open(None, {
        "tables" : [ "USER" ],

        "fieldsByTable"    : {
            "USER"         : [ "TIMESTAMP", "USER_ID", "USER_NAME", "STATUS" ],
        },

        "typesByField"     : {
            "USER_ID"      : "integer" ,
            "USER_NAME"    : "text"    ,
            "STATUS"       : "text"    ,
        },

        "keyfieldsByTable" : {
            "USER"         : [ "USER_ID" ],
        },

        "indexesByTable"   : {
            "USER"         : [ "USER_BY_TIMESTAMP" ],
        },

        "fieldsByIndex"    : {
            "USER_BY_TIMESTAMP" : [ "TIMESTAMP" ],
        }
    })

    db.on("preinsert", "USER", on_preinsert)
    db.on("insert", "USER", on_insert)

    await db.insert("USER", {
        "USER_ID"   : 1,
        "USER_NAME" : "Jane.Doe",
        "STATUS"    : "A",
    })

    async for row in db.select("* from USER"):
        print(row)

    await db.close()

async def on_preinsert(event):
    print(event)

async def on_insert(event):
    print(event)


os.chdir(SCRIPTDIR)
asyncio.run(main())

