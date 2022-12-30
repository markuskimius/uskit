import asyncio
from . import debug
from . import expression


##############################################################################
# QUERY ACCESSOR

class QueryAccessor:
    def __init__(self, db, joinspec, fieldspec=[]):
        self.db = db
        self.sortfields = []
        self.expressions = []
        self.where = []
        self.sql = ""

        idmap = []
        joinmap = []
        fieldmap = []

        # Join mapping
        joinmap += [f"""
            {joinspec[0]["table"]} as {joinspec[0]["alias"]}
        """]

        for spec in joinspec[1:]:
            joinmap += [f"""
                {spec.get("joinType", "inner")} join
                {spec["table"]} as {spec["alias"]}
                on {spec["joinOn"]}
            """]

        # Filter mapping
        for spec in joinspec:
            if "where" in spec:
                self.where += [spec["where"]]

        # RowId mapping
        for spec in joinspec:
            alias = spec["alias"]

            idmap += [ '"|"', f'cast(coalesce({alias}.rowid,"0") as text)' ]

        fieldmap += [f"""
            { "||".join(idmap[1:]) } as "__rowid__"
        """]

        # Field mapping
        for spec in fieldspec:
            fieldmap += [f"""
                {spec["source"]} as "{spec["name"]}"
            """]

        if not fieldspec:
            fieldmap += [ "*" ]

        # Argument mapping
        for spec in joinspec:
            for arg in spec.get("args", []):
                self.expressions += [expression.Expression(arg)]

        # Default sort order
        for spec in fieldspec:
            self.sortfields += [spec["name"]]

        if not self.sortfields:
            for spec in joinspec:
                alias = spec["alias"]
                self.sortfields += [f"{alias}.rowid"]

        # SQL statement
        self.sql = f"""
            { ", ".join(fieldmap) }
            from { " ".join(joinmap) }
        """

    async def __call__(self, **kwargs):
        sortfields = kwargs.get("sortfields", []) + self.sortfields
        maxcount = kwargs.get("maxcount", "")
        lastrow = kwargs.get("lastrow", {})
        where = self.where + [kwargs.get("where", "1")]
        args = []
        sql = ""

        # Start range
        if lastrow:
            criteria = {}

            # Criteria
            for field in sortfields:
                if field not in criteria:
                    criteria[field] = lastrow.get(field,0)

            where += [f"({', '.join(criteria.keys())}) > ({', '.join(['?'] * len(criteria))})"]

            # Arguments
            args += list(criteria.values())

        # End range
        if maxcount:
            maxcount = f"limit {maxcount}"

        # Select statement
        sql = f"""
            {self.sql}
            where ({") and (".join(where)})
            order by {", ".join(sortfields)}
            {maxcount}
        """

        # Arguments
        for expr in self.expressions:
            args += [expr(**kwargs)]

        args += kwargs.get("args",[])

        # Debug output
        debug.database("select " + sql, args)

        # Select
        async for found in self.db.select(sql, args):
            yield found

