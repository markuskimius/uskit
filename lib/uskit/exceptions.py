##############################################################################
# EXCEPTIONS

class UskitException(Exception):
    def __init__(self, text, code):
        self.text = text
        self.code = code

        super().__init__(f"[{code}] {text}")

class SessionException(UskitException):
    def __init__(self, text, code="XSES"):
        super().__init__(text, code)

class SessionClosedException(SessionException):
    def __init__(self, text):
        super().__init__(text, "XCLO")

class TxnException(UskitException):
    def __init__(self, text, code="XTXN"):
        super().__init__(text, code)

class DatabaseException(UskitException):
    def __init__(self, text, code="XDBX"):
        super().__init__(text, code)

class DatabaseIntegrityException(DatabaseException):
    def __init__(self, text):
        super().__init__(text, "XINT")

class DatabaseOperationalException(DatabaseException):
    def __init__(self, text):
        super().__init__(text, "XOPS")

class TxnMissingRequired(TxnException):
    def __init__(self, text):
        super().__init__(text, "XREQ")

