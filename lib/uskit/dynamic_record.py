import weakref
import asyncio
from . import debug


##############################################################################
# DYNAMIC RECORD

class DynamicRecord(dict):
    """
        A dynamic record behaves exactly like a dictionary but it's
        identifiable as dynamic if needed.
    """
    pass


##############################################################################
# DYNAMIC RECORD MANAGER

class DynamicRecordManager:
    def __init__(self, db):
        self.db = db
        self.recordByKey = weakref.WeakValueDictionary()
        self.observingTables = {}

    async def create(self, table, record):
        key = tuple([table] + [record.get(f) for f in self.db.keyfields(table)])

        """
            The record is watched and updated live for as long as there are
            references to the record.  They are auto deleted if there are no
            other references by tracking them in WeakValueDictionary.
        """

        # Observe this table
        if table not in self.observingTables:
            self.observingTables[table] = True
            self.db.on("insert", table, self.__on_insert)
            self.db.on("update", table, self.__on_update)
            self.db.on("delete", table, self.__on_delete)

        # Add the record to the WeakValueDictionary
        if key in self.recordByKey:
            self.recordByKey[key].update(record)
        else:
            """
                The instance of DynamicRecord must be saved to a local varaible
                before it is assigned to WeakValueDictionary otherwise it only
                has a weak reference so it may get deleted immediately.
            """
            record = DynamicRecord(record)
            self.recordByKey[key] = record

        return self.recordByKey[key]

    async def __on_insert(self, event):
        table = event["table"]
        record = event["record"]
        key = tuple([table] + [record.get(f) for f in self.db.keyfields(table)])

        if key in self.recordByKey:
            debug.database("DynamicRecordManager.__on_insert", table, record)

            self.recordByKey[key].update(record)

    async def __on_update(self, event):
        table = event["table"]
        record = event["record"]
        key = tuple([table] + [record.get(f) for f in self.db.keyfields(table)])

        if key in self.recordByKey:
            debug.database("DynamicRecordManager.__on_update", table, record)

            self.recordByKey[key].update(record)

    async def __on_delete(self, event):
        table = event["table"]
        record = event["record"]
        key = tuple([table] + [record.get(f) for f in self.db.keyfields(table)])

        if key in self.recordByKey:
            debug.database("DynamicRecordManager.__on_delete", table, record)

            self.recordByKey[key].clear()

