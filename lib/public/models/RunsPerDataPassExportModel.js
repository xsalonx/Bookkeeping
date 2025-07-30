/**
 * @license
 * Copyright CERN and copyright holders of ALICE O2. This software is
 * distributed under the terms of the GNU General Public License v3 (GPL
 * Version 3), copied verbatim in the file "COPYING".
 *
 * See http://alice-o2.web.cern.ch/license for full licensing information.
 *
 * In applying this license CERN does not waive the privileges and immunities
 * granted to it by virtue of its status as an Intergovernmental Organization
 * or submit itself to any jurisdiction.
 */

import { buildUrl, RemoteData } from '/js/src/index.js';
import { getRemoteDataSlice } from '../utilities/fetch/getRemoteDataSlice.js';
import { OverviewExportModel } from './OverviewExportModel.js';
import { createCSVExport, createJSONExport } from '../utilities/export.js';
import pick from '../utilities/pick.js';

/**
 * Export model specialized for runs per data pass overview
 */
export class RunsPerDataPassExportModel extends OverviewExportModel {
    /**
     * @param {ObservableData<RemoteData<Object[]>>} items$ source items
     * @param {number} [dataPassId] data pass id
     */
    constructor(items$, dataPassId) {
        super(items$);
        this._dataPassId = dataPassId;
    }

    /**
     * Set data pass id used to fetch QC flags
     * @param {number} dataPassId data pass id
     * @return {void}
     */
    setDataPassId(dataPassId) {
        this._dataPassId = dataPassId;
    }

    /**
     * Fetch QC flags for given runs
     * @param {number[]} runNumbers run numbers
     * @return {Promise<Object<number, Object[]>>} map of run number to flags
     * @private
     */
    async _fetchQcFlags(runNumbers) {
        const map = {};
        for (const runNumber of runNumbers) {
            try {
                const { items } = await getRemoteDataSlice(buildUrl('/api/qcFlags/perDataPass', {
                    dataPassId: this._dataPassId,
                    runNumber,
                    'page[limit]': 1000,
                }));
                map[runNumber] = items;
            } catch (_) {
                map[runNumber] = [];
            }
        }
        return map;
    }

    /**
     * @inheritdoc
     */
    async createExport(fileName, exportFormats, setError) {
        const itemsRemoteData = this._items$.getCurrent();
        const items = itemsRemoteData.isSuccess() ? itemsRemoteData.payload : [];

        if (!itemsRemoteData.isSuccess() || items.length === 0) {
            if (setError) {
                setError(RemoteData.failure([
                    {
                        title: 'No data found',
                        detail: 'No items were found with the provided filters',
                    },
                ]));
            }
            this.notify();
            return;
        }

        let itemsWithFlags = items;
        if (this._dataPassId) {
            try {
                const qcMap = await this._fetchQcFlags(items.map(({ runNumber }) => runNumber));
                itemsWithFlags = items.map((run) => ({ ...run, qcFlags: qcMap[run.runNumber] || [] }));
            } catch (_) {
                if (setError) {
                    setError(RemoteData.failure([
                        { title: 'QC flags fetch failed', detail: 'Unable to fetch QC flags for export' },
                    ]));
                }
                return;
            }
        }

        const selectedFields = this.getSelectedFields() || [];

        const detectors = new Set();
        for (const item of itemsWithFlags) {
            item.qcFlags?.forEach(({ detector }) => {
                if (detector?.name) {
                    detectors.add(detector.name);
                }
            });
        }

        const formatted = itemsWithFlags.map((item) => {
            const entries = Object.entries(pick(item, selectedFields));
            const mapped = entries.map(([key, value]) => {
                const formatter = exportFormats[key]?.exportFormat || ((v) => v);
                return [key, formatter(value, item)];
            });

            const perDetectorFlags = {};
            item.qcFlags?.forEach(({ detector, flagType, from, to }) => {
                const detName = detector?.name;
                if (!detName) {
                    return;
                }
                const text = `${flagType?.name ?? ''} ( from: ${from} to: ${to} )`;
                if (!perDetectorFlags[detName]) {
                    perDetectorFlags[detName] = [];
                }
                perDetectorFlags[detName].push(text);
            });
            for (const det of detectors) {
                mapped.push([det, (perDetectorFlags[det] || []).join('|')]);
            }

            return Object.fromEntries(mapped);
        });

        this.getSelectedExportType() === 'CSV'
            ? createCSVExport(formatted, `${fileName}.csv`, 'text/csv;charset=utf-8;')
            : createJSONExport(formatted, `${fileName}.json`, 'application/json');
    }
}

