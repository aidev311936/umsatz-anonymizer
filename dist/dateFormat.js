const TOKEN_REGEX = /(yyyy|MM|dd|HH|mm|ss|SSSSSS|SSS)/g;
const TOKEN_PATTERNS = {
    yyyy: {
        pattern: "\\d{4}",
        apply: (value, parts) => {
            parts.year = Number.parseInt(value, 10);
        },
    },
    MM: {
        pattern: "\\d{2}",
        apply: (value, parts) => {
            parts.month = Number.parseInt(value, 10);
        },
    },
    dd: {
        pattern: "\\d{2}",
        apply: (value, parts) => {
            parts.day = Number.parseInt(value, 10);
        },
    },
    HH: {
        pattern: "\\d{2}",
        apply: (value, parts) => {
            parts.hour = Number.parseInt(value, 10);
        },
    },
    mm: {
        pattern: "\\d{2}",
        apply: (value, parts) => {
            parts.minute = Number.parseInt(value, 10);
        },
    },
    ss: {
        pattern: "\\d{2}",
        apply: (value, parts) => {
            parts.second = Number.parseInt(value, 10);
        },
    },
    SSSSSS: {
        pattern: "\\d{6}",
        apply: (value, parts) => {
            const microseconds = Number.parseInt(value, 10);
            parts.millisecond = Math.floor(microseconds / 1000);
        },
    },
    SSS: {
        pattern: "\\d{3}",
        apply: (value, parts) => {
            parts.millisecond = Number.parseInt(value, 10);
        },
    },
};
const TOKEN_FORMATTERS = {
    yyyy: (date) => date.getFullYear().toString().padStart(4, "0"),
    MM: (date) => (date.getMonth() + 1).toString().padStart(2, "0"),
    dd: (date) => date.getDate().toString().padStart(2, "0"),
    HH: (date) => date.getHours().toString().padStart(2, "0"),
    mm: (date) => date.getMinutes().toString().padStart(2, "0"),
    ss: (date) => date.getSeconds().toString().padStart(2, "0"),
    SSSSSS: (date) => (date.getMilliseconds() * 1000).toString().padStart(6, "0"),
    SSS: (date) => date.getMilliseconds().toString().padStart(3, "0"),
};
function escapeRegExp(literal) {
    return literal.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
}
export function parseDateWithFormat(value, format) {
    const trimmedFormat = format.trim();
    if (!trimmedFormat) {
        return null;
    }
    const tokenRegex = /yyyy|MM|dd|HH|mm|ss|SSSSSS|SSS/g;
    let pattern = "";
    const setters = [];
    let lastIndex = 0;
    let match;
    while ((match = tokenRegex.exec(trimmedFormat)) !== null) {
        const literal = trimmedFormat.slice(lastIndex, match.index);
        if (literal.length > 0) {
            pattern += escapeRegExp(literal);
        }
        const token = match[0];
        const tokenPattern = TOKEN_PATTERNS[token];
        if (!tokenPattern) {
            pattern += escapeRegExp(token);
        }
        else {
            pattern += `(${tokenPattern.pattern})`;
            setters.push((segment, parts) => tokenPattern.apply(segment, parts));
        }
        lastIndex = match.index + token.length;
    }
    const remaining = trimmedFormat.slice(lastIndex);
    if (remaining.length > 0) {
        pattern += escapeRegExp(remaining);
    }
    if (pattern.length === 0) {
        return null;
    }
    const regex = new RegExp(`^${pattern}$`);
    const result = regex.exec(value.trim());
    if (!result) {
        return null;
    }
    const parts = {};
    setters.forEach((setter, index) => {
        const segment = result[index + 1];
        setter(segment, parts);
    });
    if (parts.year === undefined ||
        parts.month === undefined ||
        parts.day === undefined) {
        return null;
    }
    const date = new Date(parts.year, (parts.month ?? 1) - 1, parts.day ?? 1, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0, parts.millisecond ?? 0);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    if (date.getFullYear() !== parts.year) {
        return null;
    }
    if (parts.month !== undefined && date.getMonth() !== parts.month - 1) {
        return null;
    }
    if (parts.day !== undefined && date.getDate() !== parts.day) {
        return null;
    }
    if (parts.hour !== undefined && date.getHours() !== parts.hour) {
        return null;
    }
    if (parts.minute !== undefined && date.getMinutes() !== parts.minute) {
        return null;
    }
    if (parts.second !== undefined && date.getSeconds() !== parts.second) {
        return null;
    }
    if (parts.millisecond !== undefined && date.getMilliseconds() !== parts.millisecond) {
        return null;
    }
    return date;
}
export function formatDateWithFormat(date, format) {
    const trimmedFormat = format.trim();
    if (!trimmedFormat) {
        return date.toISOString();
    }
    return trimmedFormat.replace(TOKEN_REGEX, (token) => {
        const formatter = TOKEN_FORMATTERS[token];
        return formatter ? formatter(date) : token;
    });
}
