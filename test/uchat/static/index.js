import * as uskit from "/uskit/index.js";
import * as debug from "/uskit/debug.js";


/* ***************************************************************************
* MAIN
*/

async function main() {
    const session = uskit.session();
    const loginProxy = new LoginProxy(session);

    /* Clients */
    const loginTxn = uskit.txn_client(loginProxy, "LOGIN");
    const addUserTxn = uskit.txn_client(loginProxy, "TXN_USER_ADD");
    const editUserTxn = uskit.txn_client(loginProxy, "TXN_USER_EDIT");
    const deleteUserTxn = uskit.txn_client(loginProxy, "TXN_USER_DELETE");
    const chatTxn = uskit.txn_client(loginProxy, "TXN_CHAT");
    const userQuery = uskit.query_client(loginProxy, "QUERY_USER");
    const chatQuery = uskit.query_client(loginProxy, "QUERY_CHAT");

    /* Widgets */
    const page = await uskit.page_widget("UChat");
    const loginDialog = await uskit.dialog_widget("Sign In", { "contentUrl" : "./dialog-login.html", "cancel" : false });
    const userTable = await uskit.table_widget("User", { "controlUrl" : "./control-user.html", "sortBy" : "f_USER_ID" });
    const chatTable = await uskit.table_widget("Chat", { "controlUrl" : "./control-chat.html", "rowselect" : false, "usersortable" : false, "userfilterable" : false, "sortBy" : "f_TIMESTAMP", "sortDir" : "asc" });
    const addUserDialog = await uskit.dialog_widget("Add User", { "contentUrl" : "./dialog-adduser.html" });
    const editUserDialog = await uskit.dialog_widget("Edit User", { "contentUrl" : "./dialog-edituser.html" });
    const deleteUserDialog = await uskit.dialog_widget("Delete User", { "contentUrl" : "./dialog-deleteuser.html" });

    /* Page layout */
    page.add("content", loginDialog);
    page.add("content", userTable);
    page.add("content", chatTable);
    page.add("content", addUserDialog);
    page.add("content", editUserDialog);
    page.add("content", deleteUserDialog);

    /* Table layout */
    userTable.get("table").style.maxHeight = "30em";
    chatTable.get("table").style.maxHeight = "30em";

    /* Connectors */
    uskit.x_query_table(userQuery, userTable);
    uskit.x_query_table(chatQuery, chatTable);
    uskit.x_widget_txn(loginDialog, loginProxy, "submit");
    uskit.x_widget_txn(loginProxy, loginTxn, "submit");
    uskit.x_widget_txn(chatTable, chatTxn, "submit");
    uskit.x_widget_txn(addUserDialog, addUserTxn, "submit");
    uskit.x_widget_txn(editUserDialog, editUserTxn, "submit");
    uskit.x_widget_txn(deleteUserDialog, deleteUserTxn, "submit", () => {
        const data = [];

        userTable.data("selectall").forEach((row) => {
            data.push({
                "USER_ID" : Number(row.f_USER_ID),
            });
        });

        return data;
    });

    /* Page events */
    session.on("open", () => page.set("status", "Connected."));
    session.on("close", () => page.set("status", "Disconnected."));
    loginProxy.on("open", () => page.set("status", "Logged in."));

    /* Table events */
    userTable.on("add", () => addUserDialog.show());
    userTable.on("edit", () => editUserDialog.show());
    userTable.on("delete", () => deleteUserDialog.show());

    /* Txn events */
    chatTxn.on("ack", () => {
        const tableElement = chatTable.get("table");
        const inputElement = chatTable.get("control").querySelector("input");

        tableElement.scrollTo(0, tableElement.scrollHeight);

        inputElement.value = "";
    });

    /* Dialog setup */
    addUserDialog.on("show", () => addUserDialog.clear());
    editUserDialog.on("show", () => editUserDialog.data("table", userTable.data("selectfirst")));
    deleteUserDialog.on("show", () => {
        const selections = userTable.data("selectall");

        if(selections.length == 1) deleteUserDialog.setText("content", `Delete ${selections[0]["f_USER_NAME"]}?`);
        else                       deleteUserDialog.setText("content", `Delete ${selections.length} users?`);
    });

    /* Widget visibility */
    loginTxn.on("ack",  () => loginDialog.hide());
    loginTxn.on("nack", () => loginDialog.show());
    userQuery.on("ack",  () => userTable.show());
    userQuery.on("nack",  () => userTable.hide());
    chatQuery.on("ack",  () => chatTable.show());
    chatQuery.on("nack",  () => chatTable.hide());
    userTable.hide();
    chatTable.hide();

    /* Button enable/disable */
    userTable.on("select", (event) => userTable.data("selectall").length == 1 ? userTable.enable("edit") : userTable.disable("edit"));
    userTable.on("select", (event) => userTable.data("selectall").length >= 1 ? userTable.enable("delete") : userTable.disable("delete"));
    userTable.disable("edit");
    userTable.disable("delete");

    /* Connect to the server */
    loginDialog.show();
    session.open("/uchat");
}


/**
* LOGIN PROXY
*
* Login proxy intercepts messages between the login dialog and login txn
* then, if the session disconnects then reconnects, auto re-logs into the
* server.
*/
class LoginProxy {
    #session = null;
    #lastOpen = null;
    #lastSubmit = null;
    #eventManager = uskit.event_manager();

    constructor(session) {
        this.#session = session;
        this.#session.on("open", (event) => this.#on_open(event));
    }

    on(type, handler) {
        switch(type) {
            case "ack"    : break;
            case "nack"   : break;
            case "open"   : break;
            case "submit" : break;
            default       : this.#session.on(type, (event) => this.trigger(event)); break;
        }

        this.#eventManager.on(type, handler);
    }

    trigger(event) {
        switch(event.type) {
            case "ack"    : this.#on_ack(event); break;
            case "nack"   : this.#on_nack(event); break;
            default       : this.#eventManager.trigger(event); break;
        }
    }

    send(message) {
        const sent = this.#session.send(message);

        switch(message.MESSAGE_TYPE) {
            case "LOGIN" : this.#lastSubmit = message; break;
        }

        return sent;
    }

    isopen() {
        this.#session.isopen();
    }

    close(message) {
        this.#session.close();
    }

    #on_open(event) {
        this.#lastOpen = event;

        /* Re-login */
        if(this.#lastSubmit) {
            this.send(this.#lastSubmit);
        }
    }

    #on_ack(event) {
        this.#eventManager.trigger(event);

        /* Login accepted; session is now open */
        this.#eventManager.trigger({
            ...this.#lastOpen,
            "session" : this,
        });
    }

    #on_nack(event) {
        /* Login rejected; submit was bad */
        this.#lastSubmit = null;

        this.#eventManager.trigger(event);
    }
}


/* ***************************************************************************
* BOOTSTRAP
*/

await main();

