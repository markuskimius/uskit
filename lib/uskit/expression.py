##############################################################################
# EXPRESSION

class Expression:
    """
        At the moment we only support accessing attributes of an object.
    """

    def __init__(self, expr):
        self.ast = expr.strip().split(".")

    def __call__(self, **kwargs):
        for name in self.ast:
            kwargs = kwargs.get(name)

        return kwargs


##############################################################################
# TEST CODE

if __name__ == "__main__":
    mydict = {
        "subdict" : {
            "myvalue" : "Hello, world!",
        },
    }

    expr = Expression("mydict.subdict.myvalue")
    value = expr.eval(mydict=mydict)

    print(value)

