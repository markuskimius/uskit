/* ***************************************************************************
* TIMESTAMP
*/

export function nowstring() {
    const timestamp = new Date();
    const date = `${timestamp.getFullYear()}-${zeropad(timestamp.getMonth()+1,2)}-${zeropad(timestamp.getDate(),2)}`;
    const time = `${zeropad(timestamp.getHours(),2)}:${zeropad(timestamp.getMinutes(),2)}:${zeropad(timestamp.getSeconds(),2)}.${zeropad(timestamp.getMilliseconds(),3)}000`;
    const tzh = `${zeropad(-timestamp.getTimezoneOffset()/60, 2)}`;
    const tzm = `${zeropad(timestamp.getTimezoneOffset()%60, 2)}`;

    return `${date} ${time} ${tzh}${tzm}`;
}


export function epochstring() {
    return "0000-00-00 00:00:00.000000 +0000";
}


/* ***************************************************************************
* ZEROPAD
*/

export function zeropad(number, numdigits) {
    let string = Math.abs(number).toString();

    for(let i=string.length; i<numdigits; i++) {
        string = "0" + string;
    }

    return number < 0 ? `-${string}` : string;
}

