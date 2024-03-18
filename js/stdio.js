// TODO: Support %2$s and %* or %*3$ and other stuff
function jsSprintf(str, ...arr) {
	const regex = /%(-)?(0?[0-9]+)?([.][0-9]+)?([#][0-9]+)?([scfgpexdu%])/g;
	var i = -1;
	function callback(exp, p0, p1, p2, p3, p4) {
		if (exp=='%%') return '%';
		if (arr[++i]===undefined) return undefined;
		exp  = p2 ? parseInt(p2.substr(1)) : undefined;
		var base = p3 ? parseInt(p3.substr(1)) : undefined;
		var val;
		switch (p4) {
            // TODO some of these are sus, %p is not "precision"
            // str
			case 's': val = arr[i]; break;
			case 'c': val = ((typeof(arr[i])=='string') ? (arr[i][0]) : (String.fromCharCode(parseInt(arr[i])))); break;
            // float -- decimal places
			case 'f': val = parseFloat(arr[i]).toFixed(exp); break;
            // float -- precision
            case 'g': val = parseFloat(arr[i]).toPrecision(exp); break;
            // pointer (hex)
			case 'p': val = parseInt(arr[i]).toString(16); break;
            // exponential notation
			case 'e': val = parseFloat(arr[i]).toExponential(exp); break;
			case 'x': val = parseInt(arr[i]).toString(base?base:16); break;
			case 'd': // fall-through
            case 'u': val = parseFloat(parseInt(arr[i], base?base:10).toPrecision(exp)).toFixed(0); break;
		}
		val = typeof(val)=='object' ? JSON.stringify(val) : val.toString(base);
		var sz = parseInt(p1); /* padding size */
		var ch = p1 && p1[0]=='0' ? '0' : ' '; /* isnull? */
		while (val.length<sz) val = p0 !== undefined ? val+ch : ch+val; /* isminus? */
	   return val;
	}
	return str.replace(regex, callback);
}

export function snprintf(buf, size, str, ...args) {
    let utfStr = toUTF8(str);
    result = jsSprintf(utfStr, ...args);
    // trim the string if too long
    if (size != -1 && result.length + 1 > size)
    {
        result = result.substring(0, (size > 0) ? (size - 1) : 0);
    }
    var out = HEAPU8.slice(buf, buf + result.length + 1);
    writeUTF8(result, out);

    // Null-terminate
    out[result.length] = 0;
    return result.length;
}

export function sprintf(buf, str, ...args) {
    let result = jsSprintf(toUTF8(str), ...args);
    var out = HEAPU8.slice(buf, buf + result.length + 1);
    writeUTF8(result, out);

    // Null-terminate
    out[result.length] = 0;
    return result.length;
}

export function printf(str, ...args) {
    let result = jsSprintf(toUTF8(str), ...args);
    console.log(result);
    return result.length;
}

export default function configure(imports, settings) {
    imports.env.snprintf = snprintf;
    imports.env.sprintf = sprintf;
    imports.env.printf = printf;
}
