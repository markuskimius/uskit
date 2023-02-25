import os
import csv
import json
import asyncio
import aiosqlite
from . import util
from . import debug
from . import errors
from . import event_manager
from . import dynamic_record


##############################################################################
# DATABASE

class Database:
    def __init__(self):
        self.cfg = {}
        self.dbconn = None
        self.eventManager = event_manager.event_manager()
        self.dynamicRecordManager = dynamic_record.DynamicRecordManager(self)
        self.txnId = 0

        # Open the default config
        with open(os.path.join(util.MODULEDIR, "database.json")) as fd:
            self.cfg = json.load(fd)

    def keyfields(self, table):
        return self.cfg["keyfieldsByTable"][table]

    def on(self, op, table, handler):
        self.eventManager.on(f"{op}|{table}", handler)

    async def open(self, dbfile=None, cfg={}):
        self.dbconn = await aiosqlite.connect(dbfile or ":memory:")
        util.dictmerge(self.cfg, cfg)

        # Use the Row class as the row factory
        self.dbconn.row_factory = aiosqlite.Row

        # Add default fields to every table
        for field in self.cfg["defaultFields"]:
            for table in self.cfg["tables"]:
                if field not in self.cfg["fieldsByTable"][table]:
                    self.cfg["fieldsByTable"][table] += [field]

        # Create the tables
        for table in self.cfg["tables"]:
            fields = self.cfg["fieldsByTable"][table]
            tabledef = [f"{f} {self.cfg['typesByField'][f]}" for f in fields]

            # Create the table
            await self.dbconn.execute(f"""
                create table if not exists {table} (
                    { ", ".join(tabledef) },
                    primary key ({ ", ".join(self.cfg['keyfieldsByTable'][table]) })
                )
            """)

            # Create indexes for this table, if any
            for index in self.cfg.get("indexesByTable",{}).get(table, []):
                fields = self.cfg["fieldsByIndex"][index]

                await self.dbconn.execute(f"""
                    create index if not exists {index} on {table} (
                        { ", ".join(fields) }
                    )
                """)

    async def close(self):
        if self.dbconn:
            await self.dbconn.close()

        self.dbconn = None

    async def get(self, table, record):
        """
            Return a dynamic record that exactly matches a keyset.  The
            returned record is dynamic; that is, the values in the record are
            updated whenever the database is updated.

            @param table   The name of the table in which to search for the record.
            @param record  Dictionary containing the keyset.
            @returns       Found dynamic record.
        """

        names = record.keys()
        values = record.values()
        conditions = [f"{n}=?" for n in names]
        found = {}

        async for found in self.select(f"""
                * from {table} where {
                    " and ".join(conditions)
                }
            """, list(values)):

            break

        return await self.dynamicRecordManager.create(table, found)

    async def select(self, sqlstmt, args=[]):
        try:
            async with self.dbconn.execute(f"select {sqlstmt}", args) as cursor:
                async for row in cursor:
                    rowAsDict = {}

                    for name in row.keys():
                        rowAsDict[name] = row[name]

                    yield rowAsDict

        except aiosqlite.Error as e:
            debug.error(f"Database.select()", f"{str(e)}", sqlstmt, args)

            raise errors.DatabaseError(str(e))

    async def transact(self, txns):
        reply = []

        await self.dbconn.execute("begin transaction")

        try:
            for t in txns:
                table = t["table"]
                record = t["record"]
                operation = t["operation"]

                if   operation == "insert" : reply += [await self.insert(table, record, commit=False)]
                elif operation == "update" : reply += [await self.update(table, record, commit=False)]
                elif operation == "delete" : reply += [await self.delete(table, record, commit=False)]
                else                       : raise errors.DatabaseError(f"{operation}: Invalid operation")

            await self.dbconn.execute("commit transaction")

        except Exception as e:
            await self.dbconn.execute("rollback transaction")
            raise e

        return reply

    async def insert(self, table, record, **kwargs):
        record = record.copy()
        record["TIMESTAMP"] = util.nowstring()

        names = record.keys()
        values = record.values()
        qmarks = ["?"] * len(record)

        sqlstmt = f"""
            insert into {table} (
                { ", ".join(names) }
            )
            values (
                { ", ".join(qmarks) }
            )
            returning rowid as "__rowid__", *;
        """

        return await self.__operate("insert", table, record, sqlstmt, list(values), **kwargs)

    async def update(self, table, record, **kwargs):
        record = record.copy()
        record["TIMESTAMP"] = util.nowstring()

        names = record.keys()
        values = record.values()
        statements = [f"{n}=?" for n in names]

        keynames = self.cfg["keyfieldsByTable"][table]
        keyvalues = [record[kn] for kn in keynames]
        conditions = [f"{n}=?" for n in keynames]

        sqlstmt = f"""
            update {table} set {
                ", ".join(statements)
            }
            where {
                " and ".join(conditions)
            }
            returning rowid as "__rowid__", *;
        """

        return await self.__operate("update", table, record, sqlstmt, list(values) + list(keyvalues), **kwargs)

    async def delete(self, table, record, **kwargs):
        names = record.keys()
        values = record.values()
        conditions = [f"{n}=?" for n in names]

        sqlstmt = f"""
            delete from {table} where {
                " and ".join(conditions)
            }
            returning rowid as "__rowid__", *;
        """

        return await self.__operate("delete", table, record, sqlstmt, list(values), **kwargs)

    async def __operate(self, operation, table, record, sqlstmt, args, **kwargs):
        result = {}
        rowid = None
        txnd = False

        # Pre-transaction
        self.txnId += 1
        debug.database(sqlstmt, args)
        await self.eventManager.trigger({
            "type"      : f"pre{operation}|{table}",
            "operation" : f"pre{operation}",
            "table"     : table,
            "record"    : record,
            "txnId"     : self.txnId,
        })

        # Transaction
        try:
            async with await self.dbconn.execute(sqlstmt, args) as cursor:
                async for row in cursor:
                    for name in row.keys():
                        if name == "__rowid__":
                            rowId = row[name]
                        else:
                            result[name] = row[name]

            if kwargs.get("commit", True):
                await self.dbconn.commit()

        except aiosqlite.IntegrityError as e:
            raise errors.DatabaseIntegrityError(str(e))

        except aiosqlite.OperationalError as e:
            debug.error(f"Database.{operation}()", f"{str(e)}", sqlstmt, args)
            raise errors.DatabaseOperationalError(str(e))

        except aiosqlite.Error as e:
            raise errors.DatabaseError(str(e))

        # Post-transaction
        if result:
            await self.eventManager.trigger({
                "type"      : f"{operation}|{table}",
                "operation" : operation,
                "table"     : table,
                "record"    : result,
                "txnId"     : self.txnId,
                "rowId"     : rowId,
            })
            txnd = True

        return txnd


##############################################################################
# CSV OPERATOR

async def csvop(filename, rowHandler):
    debug.info(f"Loading into database: {filename}")
    header = []

    with open(filename) as fd:
        reader = csv.reader(fd)

        # For each row
        for row in reader:
            records = {}

            # Empty row -> next row is a new header
            if not row:
                header = None
                continue

            # No header --> this is the header
            if not header:
                header = row
                continue

            # For each column
            for (name,value) in zip(header,row):
                (table, colname, type) = name.split(".")

                if table not in records:
                    records[table] = {}

                if type == "i":
                    value = int(value)
                elif type == "f":
                    value = float(value)
                elif type == "s":
                    value = str(value)
                else:
                    raise errors.DatabaseProgrammingError(f"{filename}: Invalid type in column {colname}")

                records[table][colname] = value

            for (table,row) in records.items():
                await rowHandler(table, row)


##############################################################################
# FACTORY

async def database(cfgfile=None, **kwargs):
    """
        Create and return a database object.
    """
    db = Database()
    dbfile = kwargs.get("dbfile")
    datafiles = kwargs.get("datafiles", [])
    dbexists = dbfile and os.path.exists(dbfile)

    debug.info(f"Database {dbfile or 'in memory'} using config file '{cfgfile}'")

    # Open the database
    if cfgfile is not None:
        with open(cfgfile) as fd:
            cfg = json.load(fd)

            await db.open(dbfile, cfg)

    # Load CSV file for a new database
    if not dbexists:
        for df in datafiles:
            await csvop(df, db.insert)

    return db

