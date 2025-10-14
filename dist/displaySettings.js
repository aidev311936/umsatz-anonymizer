import { formatDateWithFormat } from "./dateFormat.js";
export const DEFAULT_DATE_DISPLAY_FORMAT = "dd.MM.yyyy";
export const DEFAULT_AMOUNT_DISPLAY_FORMAT = "#.##0,00";
export function sanitizeDisplaySettings(value) {
    const rawDate = typeof value?.booking_date_display_format === "string"
        ? value.booking_date_display_format
        : "";
    const rawAmount = typeof value?.booking_amount_display_format === "string"
        ? value.booking_amount_display_format
        : "";
    const trimmedDate = rawDate.trim();
    const trimmedAmount = rawAmount.trim();
    return {
        booking_date_display_format: trimmedDate.length > 0 ? trimmedDate : DEFAULT_DATE_DISPLAY_FORMAT,
        booking_amount_display_format: trimmedAmount.length > 0 ? trimmedAmount : DEFAULT_AMOUNT_DISPLAY_FORMAT,
    };
}
function isValidDate(date) {
    return Number.isFinite(date.getTime());
}
export function formatTransactionDate(tx, settings) {
    if (tx.booking_date_iso) {
        const parsed = new Date(tx.booking_date_iso);
        if (isValidDate(parsed)) {
            return formatDateWithFormat(parsed, settings.booking_date_display_format);
        }
    }
    const fallback = tx.booking_date_raw ?? tx.booking_date ?? "";
    return fallback;
}
function parseAmount(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    let sanitized = trimmed.replace(/[\s'\u00A0]/g, "");
    const lastComma = sanitized.lastIndexOf(",");
    const lastDot = sanitized.lastIndexOf(".");
    let decimalSeparator = "";
    if (lastComma > lastDot) {
        decimalSeparator = ",";
    }
    else if (lastDot > lastComma) {
        decimalSeparator = ".";
    }
    let result = "";
    const decimalIndex = decimalSeparator === "," ? lastComma : decimalSeparator === "." ? lastDot : -1;
    for (let index = 0; index < sanitized.length; index += 1) {
        const char = sanitized[index];
        if (index === 0 && (char === "-" || char === "+")) {
            if (char === "-") {
                result += "-";
            }
            continue;
        }
        if (char === decimalSeparator) {
            if (index === decimalIndex) {
                result += ".";
            }
            continue;
        }
        if (char === "," || char === ".") {
            continue;
        }
        if (/\d/.test(char)) {
            result += char;
        }
    }
    if (result === "" || result === "-") {
        return null;
    }
    const parsed = Number.parseFloat(result);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return parsed;
}
function formatNumberWithPattern(value, pattern) {
    const trimmedPattern = pattern.trim();
    if (!trimmedPattern) {
        return value.toString();
    }
    const firstDigitIndex = trimmedPattern.search(/[0#]/);
    if (firstDigitIndex === -1) {
        return value.toString();
    }
    const lastDigitIndex = trimmedPattern.length -
        1 -
        trimmedPattern
            .split("")
            .reverse()
            .findIndex((char) => char === "0" || char === "#");
    const prefix = trimmedPattern.slice(0, firstDigitIndex);
    const suffix = trimmedPattern.slice(lastDigitIndex + 1);
    const corePattern = trimmedPattern.slice(firstDigitIndex, lastDigitIndex + 1);
    const decimalPos = Math.max(corePattern.lastIndexOf("."), corePattern.lastIndexOf(","));
    let integerPattern = corePattern;
    let fractionPattern = "";
    let decimalChar = "";
    if (decimalPos >= 0) {
        decimalChar = corePattern[decimalPos];
        integerPattern = corePattern.slice(0, decimalPos);
        fractionPattern = corePattern.slice(decimalPos + 1);
    }
    let groupingChar = "";
    for (let index = integerPattern.length - 1; index >= 0; index -= 1) {
        const char = integerPattern[index];
        if (char !== "#" && char !== "0") {
            groupingChar = char;
            break;
        }
    }
    let groupingSize = 0;
    if (groupingChar) {
        for (let index = integerPattern.length - 1; index >= 0; index -= 1) {
            const char = integerPattern[index];
            if (char === "#" || char === "0") {
                groupingSize += 1;
            }
            else if (char === groupingChar) {
                break;
            }
        }
    }
    const minIntegerDigits = (integerPattern.match(/0/g) ?? []).length;
    const cleanedFraction = fractionPattern.replace(/[^0#]/g, "");
    const maxFractionDigits = cleanedFraction.length;
    const minFractionDigits = (fractionPattern.match(/0/g) ?? []).length;
    const negative = value < 0 || Object.is(value, -0);
    const absolute = Math.abs(value);
    let integerPart = "";
    let fractionPart = "";
    if (maxFractionDigits > 0) {
        const fixed = absolute.toFixed(maxFractionDigits);
        const [intSegment, fracSegment = ""] = fixed.split(".");
        integerPart = intSegment;
        fractionPart = fracSegment;
        while (fractionPart.length > minFractionDigits && fractionPart.endsWith("0")) {
            fractionPart = fractionPart.slice(0, -1);
        }
    }
    else {
        integerPart = Math.round(absolute).toString();
    }
    const minInteger = Math.max(minIntegerDigits, 1);
    integerPart = integerPart.padStart(minInteger, "0");
    if (groupingChar && groupingSize > 0) {
        const regex = new RegExp(`\\B(?=(\\d{${groupingSize}})+(?!\\d))`, "g");
        integerPart = integerPart.replace(regex, groupingChar);
    }
    let formatted = integerPart;
    if (fractionPart.length > 0) {
        const decimalOutput = decimalChar || ".";
        formatted += `${decimalOutput}${fractionPart}`;
    }
    const sign = negative && absolute !== 0 ? "-" : "";
    return `${sign}${prefix}${formatted}${suffix}`;
}
export function formatBookingAmount(value, settings) {
    const parsed = parseAmount(value);
    if (parsed === null) {
        return value;
    }
    return formatNumberWithPattern(parsed, settings.booking_amount_display_format);
}
export function formatTransactionsForDisplay(entries, settings) {
    return entries.map((tx) => ({
        ...tx,
        booking_date: formatTransactionDate(tx, settings),
    }));
}
