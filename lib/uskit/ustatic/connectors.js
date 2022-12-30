/* ***************************************************************************
* CONNECT QUERY TO TABLE
*/
export function connectQueryToTable(queryClient, tableWidget) {
    queryClient.addEventObserver("reset", async (event) => await tableWidget.reset());
    queryClient.addEventObserver("column", async (event) => await tableWidget.addColumn(event.content));
    queryClient.addEventObserver("insert", async (event) => await tableWidget.insertRow(event.content.__rowid__, event.content));
    queryClient.addEventObserver("update", async (event) => await tableWidget.updateRow(event.content.__rowid__, event.content));
    queryClient.addEventObserver("delete", async (event) => await tableWidget.deleteRow(event.content.__rowid__));
}


/* ***************************************************************************
* CONNECT WIDGET TO TXN
*/
export function connectWidgetToTxn(widget, txnClient, channel, contentGetter=null) {
    widget.addEventObserver(channel, async (event) => await txnClient.onSubmit(Object.assign({}, event, {
        "channel" : channel,
        "content" : contentGetter ? contentGetter() : event.content,
    })));

    txnClient.addEventObserver("ack", async (event) => await widget.onAck(Object.assign({}, event, {
        "channel" : channel,
    })));

    txnClient.addEventObserver("nack", async (event) => await widget.onNack(Object.assign({}, event, {
        "channel" : channel,
    })));
}
