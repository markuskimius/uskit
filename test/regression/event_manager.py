#!/usr/bin/env python3

import uskit
import asyncio


async def main():
    eventManager = uskit.event_manager()

    eventManager.on("open", on_open1)
    eventManager.on("open", on_open2)
    eventManager.on("close", on_close)

    await eventManager.trigger({
        "type" : "open",
    })

async def on_open1(event):
    print("on_open1 called")

async def on_open2(event):
    print("on_open2 called")

async def on_close(event):
    print("on_close called")


asyncio.run(main())

