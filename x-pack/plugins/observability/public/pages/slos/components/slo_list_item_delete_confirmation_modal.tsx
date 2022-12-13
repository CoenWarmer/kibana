/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiConfirmModal } from '@elastic/eui';
import React, { useState } from 'react';
import { i18n } from '@kbn/i18n';
import { useKibana } from '../../../utils/kibana_react';
import { deleteSlos } from '../../../hooks/slo/delete_slo';
import { SLO } from '../../../typings';

export interface DeleteConfirmationPropsModal {
  slo: SLO;
  onCancel: () => void;
  onDeleted: () => void;
}

export function DeleteConfirmationModal({
  slo: { id, name },
  onCancel,
  onDeleted,
}: DeleteConfirmationPropsModal) {
  const {
    http,
    notifications: { toasts },
  } = useKibana().services;

  const [isVisible, setIsVisible] = useState(true);

  const handleConfirm = async () => {
    if (id) {
      setIsVisible(false);
      const { successes, errors } = await deleteSlos({ http, ids: [id] });

      const hasSucceeded = Boolean(successes.length);
      const hasErrored = Boolean(errors.length);

      if (hasSucceeded) {
        toasts.addSuccess(getDeleteSuccesfulMessage(name));
      }

      if (hasErrored) {
        toasts.addDanger(getDeleteFailMessage(name));
      }

      onDeleted();
    }
  };

  return isVisible ? (
    <EuiConfirmModal
      buttonColor="danger"
      data-test-subj="sloDeleteConfirmationModal"
      title={getTitle()}
      cancelButtonText={getCancelButtonText()}
      confirmButtonText={i18n.translate(
        'xpack.observability.slos.slo.deleteConfirmationModal.deleteButtonLabel',
        {
          defaultMessage: 'Delete {name}',
          values: { name },
        }
      )}
      onCancel={onCancel}
      onConfirm={handleConfirm}
    >
      {i18n.translate('xpack.observability.slos.slo.deleteConfirmationModal.descriptionText', {
        defaultMessage: "You can't recover {name} after deleting.",
        values: { name },
      })}
    </EuiConfirmModal>
  ) : null;
}

const getTitle = () =>
  i18n.translate('xpack.observability.slos.slo.deleteConfirmationModal.title', {
    defaultMessage: 'Are you sure?',
  });

const getCancelButtonText = () =>
  i18n.translate('xpack.observability.slos.slo.deleteConfirmationModal.cancelButtonLabel', {
    defaultMessage: 'Cancel',
  });

const getDeleteSuccesfulMessage = (name: string) =>
  i18n.translate(
    'xpack.observability.slos.slo.deleteConfirmationModal.successNotification.descriptionText',
    {
      defaultMessage: 'Deleted {name}',
      values: { name },
    }
  );

const getDeleteFailMessage = (name: string) =>
  i18n.translate(
    'xpack.observability.slos.slo.deleteConfirmationModal.errorNotification.descriptionText',
    {
      defaultMessage: 'Failed to delete {name}',
      values: { name },
    }
  );
