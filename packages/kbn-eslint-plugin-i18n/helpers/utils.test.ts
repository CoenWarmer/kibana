/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { cleanString, lowerCaseFirstLetter } from './utils';

describe('Utils', () => {
  describe('lowerCaseFirstLetter', () => {
    it('should lowercase the first letter', () => {
      expect(lowerCaseFirstLetter('Hello')).toBe('hello');
      expect(lowerCaseFirstLetter('GreatSuccessYes')).toBe('greatSuccessYes');
      expect(lowerCaseFirstLetter('How is it going?')).toBe('how is it going?');
    });

    it('should lowercase all letters if the passed string is in ALL CAPS', () => {
      expect(lowerCaseFirstLetter('HELLO')).toBe('hello');
      expect(lowerCaseFirstLetter('GREATSUCCESSYES')).toBe('greatsuccessyes');
    });
  });

  describe('cleanString', () => {
    it('should remove all numbers', () => {
      expect(cleanString('123')).toBe('');
    });

    it('should remove all white spaces from beginning and end', () => {
      expect(cleanString('  abc  ')).toBe('abc');
      expect(cleanString('     This is a test    ')).toBe('This is a test');
      expect(
        cleanString(`
      
      
      hello 
      
      
      
      great!`)
      ).toBe('hello great');
    });

    it('should remove all non alphabet characters unless they are incorporated in a sentence', () => {
      expect(cleanString('1')).toBe('');
      expect(cleanString('12')).toBe('');
      expect(cleanString('123')).toBe('');
      expect(cleanString('?')).toBe('');
      expect(cleanString('!')).toBe('');
      expect(cleanString('!!')).toBe('');
      expect(cleanString('!!!')).toBe('');
      expect(cleanString('!!!!')).toBe('');
      expect(cleanString('@')).toBe('');
      expect(cleanString('!@#$%^&*()_+{}|')).toBe('');

      expect(cleanString('Hey, you.')).toBe('Hey, you.');
      expect(cleanString('     Hey, you.   ')).toBe('Hey, you.');
      expect(cleanString('  Hey?  ')).toBe('Hey?');
      expect(cleanString('Hey?')).toBe('Hey?');
      expect(cleanString('Hey, this is great! Success.')).toBe('Hey, this is great! Success.');
      expect(cleanString('   Hey, this is great! Success.   ')).toBe(
        'Hey, this is great! Success.'
      );
    });

    it('should leave markdown alone', () => {
      expect(cleanString('```hello```')).toBe('');
    });
  });
});
