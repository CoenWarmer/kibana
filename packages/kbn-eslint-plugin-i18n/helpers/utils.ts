/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

export function lowerCaseFirstLetter(str: string) {
  if (isUpperCase(str)) return str.toLowerCase();

  return str.charAt(0).toLowerCase() + str.slice(1);
}

export function upperCaseFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function isTruthy<T>(value: T): value is NonNullable<T> {
  return value != null;
}

function isUpperCase(val: string) {
  return /^[A-Z]+$/.test(val);
}

export function cleanIdentifier(str: string) {
  return str
    .replace(/```\w*```/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z\s]*/g, '')
    .trim();
}

export function cleanString(str: string) {
  const strTrimmed = str.trim();

  if (strTrimmed.length === 1) {
    return '';
  }

  // Numbers
  if (strTrimmed.replace(/[0-9]+/g, '').length === 0) {
    return '';
  }

  // Markdown
  if (strTrimmed.replace(/```\w*```/g, '').length === 0) {
    return '';
  }

  // Special characters
  if (strTrimmed.replace(/[!\@\#\$\%\^\&\*\(\)\_\+\{\}\|]+/g, '').length === 0) {
    return '';
  }

  return strTrimmed;
}
