class Error(Exception):
    def __init__(self, text, code):
        self.text = text
        self.code = code

        super().__init__(f"[{code}] {text}")

class SessionError(Error):
    def __init__(self, text, code="XSES"):
        super().__init__(text, code)

class SessionClosedError(SessionError):
    def __init__(self, text):
        super().__init__(text, "XCLO")

class DatabaseError(Error):
    def __init__(self, text, code="XDBX"):
        super().__init__(text, code)

class DatabaseIntegrityError(DatabaseError):
    def __init__(self, text):
        super().__init__(text, "XINT")

class DatabaseOperationalError(DatabaseError):
    def __init__(self, text):
        super().__init__(text, "XOPS")

class DatabaseProgrammingError(DatabaseError):
    def __init__(self, text):
        super().__init__(text, "XOPS")

class TxnError(Error):
    def __init__(self, text, code="XTXN"):
        super().__init__(text, code)

class TxnMissingRequired(TxnError):
    def __init__(self, text):
        super().__init__(text, "XREQ")

