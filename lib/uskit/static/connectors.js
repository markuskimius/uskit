import * as debug from "./debug.js";


/**
* Connect query to table.
*/
export function x_query_table(queryClient, tableWidget) {
    queryClient.on("reset", (event) => tableWidget.reset());
    queryClient.on("column", (event) => tableWidget.column(event.content));
    queryClient.on("insert", (event) => tableWidget.insert(event.content.__rowid__, event.content));
    queryClient.on("update", (event) => tableWidget.update(event.content.__rowid__, event.content));
    queryClient.on("delete", (event) => tableWidget.delete(event.content.__rowid__));
}


/**
* Connect widget to txn.
*/
export function x_widget_txn(widget, txnClient, channel="submit", contentGetter=null) {
    widget.on(channel, (event) => txnClient.trigger({
        ...event,
        "type"    : "submit",
        "channel" : channel,
        "content" : contentGetter ? contentGetter() : event.content,
    }));

    txnClient.on("ack", (event) => widget.trigger({
        ...event,
        "type"    : "ack",
        "channel" : channel,
    }));

    txnClient.on("nack", (event) => widget.trigger({
        ...event,
        "type"    : "nack",
        "channel" : channel,
    }));
}
