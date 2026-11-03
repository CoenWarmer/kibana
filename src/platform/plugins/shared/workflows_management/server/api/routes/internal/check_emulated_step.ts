/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import { getConnectorSpec } from '@kbn/connector-specs';
import type { ConnectorEmulator, EmulationCheck } from '@kbn/connector-specs/server';
import { ConnectorNotEmulatableError, createConnectorEmulator } from '@kbn/connector-specs/server';
import type { RouteDependencies } from '../types';
import { INTERNAL_API_VERSION } from '../utils/route_constants';
import { WORKFLOW_READ_SECURITY } from '../utils/route_security';
import { withAvailabilityCheck } from '../utils/with_availability_check';

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_STEP_TYPE_LENGTH = 512;
const MAX_OPERATION_LENGTH = 2048;
const MAX_HEADER_LENGTH = 8192;
const MIN_STATUS = 100;
const MAX_STATUS = 599;
const SET_OUTPUT_HINT = 'Set emulate.output on the step to choose its output.';

// Snapshots are committed files, so a connector's emulator stays valid for the process' lifetime.
const emulators = new Map<string, Promise<ConnectorEmulator>>();

const notEmulatable = (message: string): EmulationCheck => ({
  status: 'not-emulatable',
  message: `${message}\n${SET_OUTPUT_HINT}`,
});

export function registerCheckEmulatedStepRoute({ router, logger }: RouteDependencies) {
  router.versioned
    .post({
      path: '/internal/workflows/emulation/check',
      access: 'internal',
      security: WORKFLOW_READ_SECURITY,
      options: { body: { maxBytes: MAX_REQUEST_BYTES } },
    })
    .addVersion(
      {
        version: INTERNAL_API_VERSION,
        validate: {
          request: {
            body: schema.object({
              stepType: schema.string({ maxLength: MAX_STEP_TYPE_LENGTH }),
              response: schema.maybe(
                schema.object({
                  status: schema.maybe(schema.number({ min: MIN_STATUS, max: MAX_STATUS })),
                  headers: schema.maybe(
                    schema.recordOf(
                      schema.string({ maxLength: MAX_HEADER_LENGTH }),
                      schema.string({ maxLength: MAX_HEADER_LENGTH })
                    )
                  ),
                  body: schema.maybe(schema.any()),
                  operation: schema.maybe(schema.string({ maxLength: MAX_OPERATION_LENGTH })),
                })
              ),
            }),
          },
        },
      },
      withAvailabilityCheck(async (_context, request, response) => {
        const { stepType, response: vendorResponse } = request.body;
        const [connectorType, action] = stepType.split('.', 2);
        const typeId = `.${connectorType}`;
        const connector = getConnectorSpec(typeId);
        if (!connector || !action) {
          return response.ok({
            body: notEmulatable(`${stepType} steps have no vendor API to emulate.`),
          });
        }
        try {
          const emulator = emulators.get(typeId) ?? createConnectorEmulator(connector);
          emulators.set(typeId, emulator);
          const check = await (await emulator).checkAction(action, vendorResponse);
          return response.ok({
            body: check.status === 'not-emulatable' ? notEmulatable(check.message) : check,
          });
        } catch (error) {
          if (error instanceof ConnectorNotEmulatableError) {
            return response.ok({ body: notEmulatable(`${error.message}.`) });
          }
          // Running the step still validates it, so a failed check shouldn't flag the editor.
          emulators.delete(typeId);
          logger.debug(`Couldn't check emulated step ${stepType}: ${error}`);
          return response.ok({ body: { status: 'ok' } });
        }
      })
    );
}
