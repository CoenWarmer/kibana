/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPagination } from '@elastic/eui';

import { useFetchSloList } from '../../../hooks/slo/use_fetch_slo_list';
import { SloListItem } from './slo_list_item';

export function SloList() {
  const [activePage, setActivePage] = useState(0);
  const [shouldReload, setShouldReload] = useState(false);

  const {
    sloList: { results: slos = [], total, perPage },
  } = useFetchSloList({ page: activePage + 1, refetch: shouldReload });

  useEffect(() => {
    if (shouldReload) {
      setShouldReload(false);
    }
  }, [shouldReload]);

  const handleDelete = () => {
    setShouldReload(true);
  };

  const handlePageClick = (pageNumber: number) => {
    setActivePage(pageNumber);
    setShouldReload(true);
  };

  return (
    <EuiFlexGroup direction="column" gutterSize="m" data-test-subj="sloList">
      <EuiFlexItem>
        <EuiFlexGroup direction="column" gutterSize="s">
          {slos.length
            ? slos.map((slo) => (
                <EuiFlexItem key={slo.id}>
                  <SloListItem slo={slo} onDelete={handleDelete} />
                </EuiFlexItem>
              ))
            : null}
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexEnd">
          <EuiFlexItem>
            <EuiPagination
              pageCount={total / perPage}
              activePage={activePage}
              onPageClick={handlePageClick}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
