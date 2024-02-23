"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decrypt = exports.encrypt = exports.doesFileExist = exports.scrollToBottom = exports.getNextDateFromCron = void 0;
const cron_parser_1 = __importDefault(require("cron-parser"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const promises_1 = require("node:fs/promises");
const constants_1 = require("./constants");
async function scrollToBottom(el) {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < el.scrollHeight; i += 100) {
        el.scrollTo(0, i);
        await delay(100);
    }
}
exports.scrollToBottom = scrollToBottom;
function getNextDateFromCron(cronExpression) {
    try {
        const interval = cron_parser_1.default.parseExpression(cronExpression);
        return interval.next().toDate();
    }
    catch (err) {
        console.error("Error parsing cron expression:", err);
    }
}
exports.getNextDateFromCron = getNextDateFromCron;
async function doesFileExist(filePath) {
    try {
        await (0, promises_1.access)(filePath, promises_1.constants.R_OK);
        return true;
    }
    catch {
        return false;
    }
}
exports.doesFileExist = doesFileExist;
function encrypt(text) {
    let cipher = node_crypto_1.default.createCipheriv("aes-256-cbc", Buffer.from(constants_1.ENCRYPTION.KEY), constants_1.ENCRYPTION.IV);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return {
        iv: constants_1.ENCRYPTION.IV.toString("hex"),
        encryptedData: encrypted.toString("hex"),
    };
}
exports.encrypt = encrypt;
function decrypt(text) {
    let encryptedText = Buffer.from(text, "hex");
    let decipher = node_crypto_1.default.createDecipheriv("aes-256-cbc", Buffer.from(constants_1.ENCRYPTION.KEY), constants_1.ENCRYPTION.IV);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}
exports.decrypt = decrypt;
