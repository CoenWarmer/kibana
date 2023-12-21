/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { ThemeProvider } from 'styled-components';
import { mount } from 'enzyme';
import { waitFor } from '@testing-library/react';

import { fields } from '@kbn/data-plugin/common/mocks';

import { useKibana } from '../../lib/kibana';

import { ThreatMatchComponent } from '.';
import type { ThreatMapEntries } from './types';
import type { DataViewBase } from '@kbn/es-query';
import { getMockTheme } from '../../lib/kibana/kibana_react.mock';

const mockTheme = getMockTheme({
  eui: {
    euiColorLightShade: '#ece',
  },
});

jest.mock('../../lib/kibana');

const getPayLoad = (): ThreatMapEntries[] => [
  { entries: [{ field: 'host.name', type: 'mapping', value: 'host.name' }] },
];

const getDoublePayLoad = (): ThreatMapEntries[] => [
  { entries: [{ field: 'host.name', type: 'mapping', value: 'host.name' }] },
  { entries: [{ field: 'host.name', type: 'mapping', value: 'host.name' }] },
];

describe('ThreatMatchComponent', () => {
  const getValueSuggestionsMock = jest.fn().mockResolvedValue(['value 1', 'value 2']);

  beforeEach(() => {
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        unifiedSearch: {
          autocomplete: {
            getValueSuggestions: getValueSuggestionsMock,
          },
        },
      },
    });
  });

  afterEach(() => {
    getValueSuggestionsMock.mockClear();
  });

  test('it displays empty entry if no "listItems" are passed in', () => {
    const wrapper = mount(
      <ThemeProvider theme={mockTheme}>
        <ThreatMatchComponent
          listItems={[]}
          indexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          threatIndexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          onChange={jest.fn()}
        />
      </ThemeProvider>
    );

    expect(wrapper.find('EuiFlexGroup[data-test-subj="itemEntryContainer"]')).toHaveLength(1);
    expect(wrapper.find('[data-test-subj="entryField"] input').props().placeholder).toEqual(
      'Search'
    );
    expect(wrapper.find('[data-test-subj="threatEntryField"] input').props().placeholder).toEqual(
      'Search'
    );
  });

  test('it displays "Search" for "listItems" that are passed in', async () => {
    const wrapper = mount(
      <ThemeProvider theme={mockTheme}>
        <ThreatMatchComponent
          listItems={getPayLoad()}
          indexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          threatIndexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          onChange={jest.fn()}
        />
      </ThemeProvider>
    );
    expect(wrapper.find('EuiFlexGroup[data-test-subj="itemEntryContainer"]')).toHaveLength(1);
    expect(wrapper.find('[data-test-subj="entryField"] input').at(0).props().placeholder).toEqual(
      'Search'
    );

    wrapper.unmount();
  });

  test('it displays "or", "and" enabled', () => {
    const wrapper = mount(
      <ThemeProvider theme={mockTheme}>
        <ThreatMatchComponent
          listItems={[]}
          indexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          threatIndexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          onChange={jest.fn()}
        />
      </ThemeProvider>
    );

    expect(wrapper.find('[data-test-subj="andButton"] button').prop('disabled')).toBeFalsy();
    expect(wrapper.find('[data-test-subj="orButton"] button').prop('disabled')).toBeFalsy();
  });

  test('it adds an entry when "and" clicked', async () => {
    const wrapper = mount(
      <ThemeProvider theme={mockTheme}>
        <ThreatMatchComponent
          listItems={[]}
          indexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          threatIndexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          onChange={jest.fn()}
        />
      </ThemeProvider>
    );

    expect(wrapper.find('EuiFlexGroup[data-test-subj="itemEntryContainer"]')).toHaveLength(1);

    wrapper.find('[data-test-subj="andButton"] button').simulate('click');

    await waitFor(() => {
      expect(wrapper.find('EuiFlexGroup[data-test-subj="itemEntryContainer"]')).toHaveLength(2);
      expect(wrapper.find('[data-test-subj="entryField"] input').at(0).props().placeholder).toEqual(
        'Search'
      );
      expect(
        wrapper.find('[data-test-subj="threatEntryField"] input').at(0).props().placeholder
      ).toEqual('Search');
      expect(wrapper.find('[data-test-subj="entryField"] input').at(1).props().placeholder).toEqual(
        'Search'
      );
      expect(
        wrapper.find('[data-test-subj="threatEntryField"] input').at(1).props().placeholder
      ).toEqual('Search');
    });
  });

  test('it adds an item when "or" clicked', async () => {
    const wrapper = mount(
      <ThemeProvider theme={mockTheme}>
        <ThreatMatchComponent
          listItems={[]}
          indexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          threatIndexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          onChange={jest.fn()}
        />
      </ThemeProvider>
    );

    expect(wrapper.find('EuiFlexGroup[data-test-subj="entriesContainer"]')).toHaveLength(1);

    wrapper.find('[data-test-subj="orButton"] button').simulate('click');

    await waitFor(() => {
      expect(wrapper.find('EuiFlexGroup[data-test-subj="entriesContainer"]')).toHaveLength(2);
      expect(wrapper.find('[data-test-subj="entryField"] input').at(0).props().placeholder).toEqual(
        'Search'
      );
      expect(
        wrapper.find('[data-test-subj="threatEntryField"] input').at(0).props().placeholder
      ).toEqual('Search');
      expect(wrapper.find('[data-test-subj="entryField"] input').at(1).props().placeholder).toEqual(
        'Search'
      );
      expect(
        wrapper.find('[data-test-subj="threatEntryField"] input').at(1).props().placeholder
      ).toEqual('Search');
    });
  });

  test('it removes one row if user deletes a row', () => {
    const wrapper = mount(
      <ThemeProvider theme={mockTheme}>
        <ThreatMatchComponent
          listItems={getDoublePayLoad()}
          indexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          threatIndexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          onChange={jest.fn()}
        />
      </ThemeProvider>
    );

    expect(wrapper.find('div[data-test-subj="entriesContainer"]').length).toEqual(2);
    wrapper.find('[data-test-subj="firstRowDeleteButton"] button').simulate('click');
    expect(wrapper.find('div[data-test-subj="entriesContainer"]').length).toEqual(1);
    wrapper.unmount();
  });

  test('it displays "and" badge if at least one item includes more than one entry', () => {
    const wrapper = mount(
      <ThemeProvider theme={mockTheme}>
        <ThreatMatchComponent
          listItems={[]}
          indexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          threatIndexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          onChange={jest.fn()}
        />
      </ThemeProvider>
    );

    expect(wrapper.find('[data-test-subj="entryItemEntryFirstRowAndBadge"]').exists()).toBeFalsy();

    wrapper.find('[data-test-subj="andButton"] button').simulate('click');

    expect(wrapper.find('[data-test-subj="entryItemEntryFirstRowAndBadge"]').exists()).toBeTruthy();
  });

  test('it does not display "and" badge if none of the items include more than one entry', () => {
    const wrapper = mount(
      <ThemeProvider theme={mockTheme}>
        <ThreatMatchComponent
          listItems={[]}
          indexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          threatIndexPatterns={
            {
              id: '1234',
              title: 'logstash-*',
              fields,
            } as DataViewBase
          }
          onChange={jest.fn()}
        />
      </ThemeProvider>
    );

    wrapper.find('[data-test-subj="orButton"] button').simulate('click');

    expect(wrapper.find('[data-test-subj="entryItemEntryFirstRowAndBadge"]').exists()).toBeFalsy();

    wrapper.find('[data-test-subj="orButton"] button').simulate('click');

    expect(wrapper.find('[data-test-subj="entryItemEntryFirstRowAndBadge"]').exists()).toBeFalsy();
  });
});
