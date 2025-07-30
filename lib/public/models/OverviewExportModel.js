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

import { Observable } from '/js/src/index.js';
import { RemoteData } from '/js/src/index.js';
import { ObservableData } from '../utilities/ObservableData.js';
import { createCSVExport, createJSONExport } from '../utilities/export.js';
import pick from '../utilities/pick.js';

/**
 * Model handling export configuration and creation
 */
export class OverviewExportModel extends Observable {
    /**
     * @param {ObservableData<RemoteData<Object[]>>} [items$] observable data used as source for export
     */
    constructor(items$ = ObservableData.builder().initialValue(RemoteData.notAsked()).build()) {
        super();

        /** @type {ObservableData<RemoteData<Object[]>>} */
        this._items$ = items$;
        /** @type {string[]} */
        this._selectedFields = [];
        /** @type {string} */
        this._selectedExportType = 'JSON';
        /** @type {Observable} */
        this._visualChange$ = new Observable();
    }

    /**
     * Set the observable data used as source of items to export
     * @param {ObservableData<RemoteData<Object[]>>} items$
     * @return {void}
     */
    setItemsSource(items$) {
        this._items$ = items$;
    }

    /**
     * Observable notified when the export configuration visually changes
     * @return {Observable}
     */
    get visualChange$() {
        return this._visualChange$;
    }

    /**
     * Get export type selected by the user
     * @return {string} export type
     */
    getSelectedExportType() {
        return this._selectedExportType;
    }

    /**
     * Set export type
     * @param {string} exportType export type
     * @return {void}
     */
    setSelectedExportType(exportType) {
        this._selectedExportType = exportType;
        this.notify();
        this._visualChange$.notify();
    }

    /**
     * Get selected fields
     * @return {string[]} selected fields
     */
    getSelectedFields() {
        return this._selectedFields;
    }

    /**
     * Update selected fields from HTML options list
     * @param {HTMLCollection|Array} selectedOptions options collection
     * @return {void}
     */
    setSelectedFields(selectedOptions) {
        this._selectedFields = [];
        [...selectedOptions].forEach(({ value }) => this._selectedFields.push(value));
        this.notify();
        this._visualChange$.notify();
    }

    /**
     * Create export using current items observable
     * @param {string} fileName base file name
     * @param {Object<string, *>} exportFormats export configuration per field
     * @param {function(RemoteData):void} [setError] callback for setting error
     * @return {Promise<void>} void
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

        const selectedFields = this.getSelectedFields() || [];

        const detectors = new Set();
        for (const item of items) {
            item.qcFlags?.forEach(({ detector }) => {
                if (detector?.name) {
                    detectors.add(detector.name);
                }
            });
        }

        const formatted = items.map((item) => {
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


