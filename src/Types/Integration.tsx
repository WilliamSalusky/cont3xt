import ComponentTooltip from "../Components/ComponentTooltip";
import {IndicatorNode} from "./IndicatorNode";
import {integrationNames} from "../Util/IntegrationDefinitions";
import {
    fetchCensysDataIP,
    fetchPassiveTotalPassiveDNS,
    fetchPassiveTotalSubDomains,
    fetchPassiveTotalWhois, fetchSpurDataIP,
    fetchThreatStream, fetchURLScan, fetchVirusTotalDomain, fetchVirusTotalHash, fetchVirusTotalIP, fetchWhois
} from "../Requests/IntegrationRequests";
import {
    infoBox
} from "../Components/ColorDictBox";
import {TooltipCopy} from "../Components/TooltipCopy";
import {generateIntegrationReportTooltipCopy} from "../Util/IntegrationReports";
import {makeClickableLink, toColorText, typeColors} from "../Util/Util";
import {IndicatorData} from "./Types";
import {getCleaner, toOrderedKeys} from "../Util/IntegrationCleaners";
import React from "react";
import {tryUseASN} from "../Util/IpASN";
import {whiteFilter} from "../Util/Filters";
import {Colors} from "../Style/Theme";
import {DataLayout, layouts} from "../Layouts/DataLayout";
import {linkOutColumn, TableLayout} from "../Layouts/TableLayout";
import {emojiFlagOrEmptyString} from "../Util/StringUtil";
import {Global} from "../Settings/Global";
import {ListLayout, StringListLayout} from "../Layouts/ListLayout";
import {PassiveTotalDnsTableLayout} from "../Layouts/CustomLayouts";
import {MaxLen} from "../Util/ElemUtil";
import {Unbreakable} from "../Style/Unbreakable";

const DEF_DATE = 'N/A ';

export class Integration {

    type: string;
    data: any;
    imgSrc: string = './images/report.svg';
    imgAlt: string;
    imgStyle: any;

    indicatorNode?: IndicatorNode;

    compUI? : JSX.Element;

    constructor(result: any, type: string) {
        const cleaner = getCleaner(type);
        this.data = cleaner(result.data);
        this.type = type;
        this.imgAlt = type;
    }

    getDataLayout(key: string) : DataLayout | undefined {
        return undefined;
    }

    getRes(): any {
        return null;
    }

    genTitleUI(): JSX.Element {
        return (
            <div className="ResultBox" style={{justifyContent: 'space-between', marginBottom: 5, padding: 5, fontSize: 12, borderRadius: 8}}>
                <span style={{color: Colors.highlight, fontWeight: 'bold'}}>{this.type}<Unbreakable style={{color: Colors.lightgray}}>{' for '}</Unbreakable><p style={{color: 'white'}}><MaxLen max={30}>{this.genIndicatorData().value}</MaxLen></p><p style={{color: Colors.lightgray}}>:</p></span>
            </div>
        );
    }

    genUI() {
        const orderedKeys = toOrderedKeys(this.type, Object.keys(this.data));

        return (
            <div className="WhoIsBox">
                <TooltipCopy valueFunc={() => generateIntegrationReportTooltipCopy(this.genIndicatorData(), this.type, this.data)}/>
                {this.genTitleUI()}
                {orderedKeys.map((key: string) => {
                    const dataLayout = this.getDataLayout(key);
                    if (dataLayout === undefined) {
                        const colorData = toColorText(this.data[key]);
                        return infoBox(key, colorData);
                    }
                    return dataLayout.genUI();
                })}
            </div>
        );
    }

    genImage() {
        return <img className="ExternalLink" src={this.imgSrc} alt={this.imgAlt} style={this.imgStyle}/>
    }

    genInlineUI() {
        const flavor = this.genFlavorUI();
        const img = this.genImage();
        if (flavor) {
            return <span>{img}{flavor}</span>
        }
        return img;
    }



    genIntegrationUI: React.FC<{
        setActiveIntegration: React.Dispatch<React.SetStateAction<JSX.Element>>
    }> = (props) => {

        let handle: NodeJS.Timeout;

        const inner = (
            <div className="Pointer" onMouseEnter={() => {
                handle = setTimeout(()=>{
                    props.setActiveIntegration(this.compUI as JSX.Element);
                }, 1000 * Global.settings.integrationPanelDelayTime)
            }} onMouseLeave={() => {
                clearTimeout(handle);
            }}>
                {this.genInlineUI()}
            </div>
        );

        return (
            Global.settings.integrationPopups ? <ComponentTooltip comp={this.compUI}>{inner}</ComponentTooltip> : inner
        );
    }

    genFlavorUI() {
        let txt = this.genFlavorText();
        if (txt !== '') {
            if (this.shouldDecorateFlavorTextWithParens()) txt = `(${txt})`;
            return <p style={{fontSize: 14, color: 'lightgray', ...this.genFlavorStyle()}}>{txt}</p>
        }
        return null;
    }

    shouldDecorateFlavorTextWithParens() {return true;}

    genFlavorText() {
        return '';
    }

    genFlavorStyle(): any {
        const text = this.genFlavorText();
        if (text !== '' && text !== '0') {
            return {color: typeColors.dnsType, fontWeight: 'bold'};
        }
        return {color: 'lightgray'};
    }

    onAdd(indicatorNode: IndicatorNode) {
        this.indicatorNode = indicatorNode;
        this.compUI = this.genUI();
    }

    generateReport(withHeader?: boolean) : string {
        return (withHeader ? `${this.type}: ` : '') + JSON.stringify(this.data);
    }

    static startAsyncAddTo(integrationTask: Promise<Integration | null>, indicatorNode: IndicatorNode, onFinish?: ()=>void) {
        integrationTask.then(integration => {
            if (integration !== null) {
                indicatorNode.integrations.push(integration);
                integration.onAdd(indicatorNode);
                onFinish?.();
            }
        });
    }

    static typeIsEnabled(type: string): boolean {
        const mask = Global.settings.integrationMask;
        switch (type) {
            case integrationNames.SPUR:
                return mask.spur;

            case integrationNames.THREAT_STREAM:
                return mask.threatStream;

            case integrationNames.PASSIVETOTAL_WHOIS:
            case integrationNames.PASSIVETOTAL_SUBDOMAINS:
            case integrationNames.PASSIVETOTAL_PASSIVE_DNS_DOMAIN:
            case integrationNames.PASSIVETOTAL_PASSIVE_DNS_IP:
                return mask.passiveTotal;

            case integrationNames.URL_SCAN:
                return mask.urlScan;

            case integrationNames.VIRUS_TOTAL_DOMAIN:
            case integrationNames.VIRUS_TOTAL_IP:
            case integrationNames.VIRUS_TOTAL_HASH:
                return mask.virusTotal;

            case integrationNames.CENSYS_IP:
                return mask.censys;

            case integrationNames.WHOIS:
                return mask.whois;
        }
        return true;
    }

    static startAsyncAddFromVal(type: string, value: string, indicatorNode: IndicatorNode, onFinish?: ()=>void) {
        if (this.typeIsEnabled(type)) {
            this.startAsyncAddTo(Integration.create(type, Integration.getResTask(type, value)), indicatorNode, onFinish);
        } else {
            console.log(`${type} is disabled is settings... skipping.`)
        }
    }

    static async create(type: string, resTask: Promise<any>): Promise<Integration | null> {
        const res: any = await resTask;

        if (res?.data == null || res?.data === 'err') {
            return null;
        }

        switch (type) {
            case integrationNames.SPUR:
                return new SpurIntegration(res);
            case integrationNames.THREAT_STREAM:
                return new ThreatStreamIntegration(res);
            case integrationNames.PASSIVETOTAL_SUBDOMAINS:
                return new PassiveTotalSubdomainsIntegration(res);
            case integrationNames.PASSIVETOTAL_PASSIVE_DNS_DOMAIN:
            case integrationNames.PASSIVETOTAL_PASSIVE_DNS_IP:
                return new PassiveTotalPassiveDNSIntegration(res, type);
            case integrationNames.PASSIVETOTAL_WHOIS:
                return new PassiveTotalWhoisIntegration(res);
            case integrationNames.URL_SCAN:
                return new UrlScanIntegration(res);
            case integrationNames.VIRUS_TOTAL_DOMAIN:
            case integrationNames.VIRUS_TOTAL_IP:
            case integrationNames.VIRUS_TOTAL_HASH:
                return new VirusTotalIntegration(res, type);
            case integrationNames.CENSYS_IP:
                return new CensysIntegration(res, type);
            case integrationNames.WHOIS:
                return new WhoisIntegration(res);
            default:
                return new Integration(res, type);
        }
    }

    static async getResTask(type: string, value: string): Promise<any> {
        switch (type) {
            case integrationNames.THREAT_STREAM:
                return fetchThreatStream(value);
            case integrationNames.PASSIVETOTAL_WHOIS:
                return fetchPassiveTotalWhois(value);
            case integrationNames.PASSIVETOTAL_SUBDOMAINS:
                return fetchPassiveTotalSubDomains(value);
            case integrationNames.PASSIVETOTAL_PASSIVE_DNS_DOMAIN:
            case integrationNames.PASSIVETOTAL_PASSIVE_DNS_IP:
                return fetchPassiveTotalPassiveDNS(value);
            case integrationNames.SPUR:
                return fetchSpurDataIP(value);
            case integrationNames.CENSYS_IP:
                return fetchCensysDataIP(value);
            case integrationNames.URL_SCAN:
                return fetchURLScan(value);
            case integrationNames.VIRUS_TOTAL_DOMAIN:
                return fetchVirusTotalDomain(value);
            case integrationNames.VIRUS_TOTAL_IP:
                return fetchVirusTotalIP(value);
            case integrationNames.VIRUS_TOTAL_HASH:
                return fetchVirusTotalHash(value);
            case integrationNames.WHOIS:
                return fetchWhois(value);
        }
    }

    genIndicatorData(): IndicatorData {
        return this.indicatorNode?.genIndicatorData() as IndicatorData;
    }
}


export class ThreatStreamIntegration extends Integration {
    constructor(result: any) {
        super(result, integrationNames.THREAT_STREAM);
        this.imgSrc = './images/anomali.webp';
    }

    tryCount(): number {
        try {
            return this.data.objects.length;
        } catch {
            return -1;
        }
    }

    genFlavorText(): string {
        const count = this.tryCount();
        if (count === -1) return super.genFlavorText();
        return count.toString();
    }

    genFlavorStyle(): any {
        const count = this.tryCount();
        if (count > 0) return {color: typeColors.malicious, fontWeight: 'bold'};
        return null;
    }

    getDataLayout(key: string): DataLayout | undefined {
        if (key === 'object_table') {
            return new TableLayout(key, this.data.objects,
                [
                    ['status', 'string'],
                    ['tlp', 'string'],
                    ['itype', 'string'],
                    ['source', 'string'],
                    ['confidence', 'number'],
                    ['import_session_id', 'number'],
                    ['',
                        linkOutColumn(value => {
                            const {REACT_APP_THREATSTREAM_UI_URL: urlBase} = process.env;
                            if (urlBase != null && value != null) return `https://${urlBase}/import/review/${value}`;
                        })
                    ],
                    ['created_ts', 'primary_date'],
                ], (rowData => {
                    const {status, tlp, itype, source, confidence, import_session_id, created_ts} = rowData;
                    return [status, tlp, itype, source, confidence, import_session_id, import_session_id, created_ts];
                }));
        }
    }
}

export class PassiveTotalIntegration extends Integration {
    constructor(result: any, type: string) {
        super(result, type);
        this.imgSrc = './images/passivetotalIcon.png';
    }
}

export class PassiveTotalSubdomainsIntegration extends PassiveTotalIntegration {
    constructor(result: any) {
        super(result, integrationNames.PASSIVETOTAL_SUBDOMAINS);
    }

    genFlavorText(): string {
        try {
            return String(this.data.subdomains.length);
        } catch {
            return super.genFlavorText();
        }
    }

    getDataLayout(key: string): DataLayout | undefined {
        if (key === 'subdomains') return new StringListLayout(key, this.data[key], 70);
        return layouts.hidden;
    }
}

export class PassiveTotalPassiveDNSIntegration extends PassiveTotalIntegration {

    genFlavorText(): string {
        try {
            return String(this.data.results.length);
        } catch {
            return super.genFlavorText();
        }
    }

    getDataLayout(key: string): DataLayout | undefined {
        if (key === 'results') return new PassiveTotalDnsTableLayout(this.data.results, this.genIndicatorData());
    }
}

export class PassiveTotalWhoisIntegration extends PassiveTotalIntegration {
    constructor(result: any) {
        super(result, integrationNames.PASSIVETOTAL_WHOIS);
        this.imgSrc = './images/whoisIcon.svg';
        this.imgStyle = whiteFilter;
    }
}

export class UrlScanIntegration extends Integration {
    constructor(result: any) {
        super(result, integrationNames.URL_SCAN);
        this.imgSrc = './images/urlscanIcon.png';
    }

    onAdd(indicatorNode: IndicatorNode) {
        super.onAdd(indicatorNode);
        tryUseASN(indicatorNode, this.type, this.data);
    }

    genFlavorText(): string {
        try {
            return String(this.data.total);
        } catch {
            return super.genFlavorText();
        }
    }

    getDataLayout(key: string): DataLayout | undefined {

        if (key === 'results') {
            return new TableLayout(key, this.data[key],
                [
                    ['visibility', 'string'],
                    ['method', 'string'],
                    ['url', 'string|max_30'],
                    ['',
                        linkOutColumn(value => `https://urlscan.io/result/${value}`),
                    ],
                    ['country',
                        {
                            genContents: value => `${value} ${emojiFlagOrEmptyString(value)}`,
                            style: {color: typeColors.string}
                        }],
                    ['server', 'string'],
                    ['status', 'number'],
                    ['screenshot',
                        {genContents: value => makeClickableLink(value, value.substr(0, 15))},
                    ],
                    ['time', 'primary_date'],
                ],
                (rowData: any) => {
                    const {visibility, method, url, uuid, time} = rowData.task ?? {};
                    const {country = 'N/A', server, status} = rowData.page ?? {};
                    const {screenshot} = rowData;

                    return [visibility, method, url, uuid, country, server, status, screenshot, time];
                });
        }
    }
}

export class VirusTotalIntegration extends Integration {
    constructor(result: any, type: string) {
        super(result, type);
        this.imgSrc = './images/virustotal.svg';
    }

    onAdd(indicatorNode: IndicatorNode) {
        super.onAdd(indicatorNode);
        if (this.type === integrationNames.VIRUS_TOTAL_IP) tryUseASN(indicatorNode, this.type, this.data);
    }

    tryCount(): number | null {
        try {
            return this.data.response_code;
        } catch {
            return null;
        }
    }

    genFlavorText(): string {
        const count = this.tryCount();
        if (count === null) return super.genFlavorText();
        return count.toString();
    }

    getDataLayout(key: string): DataLayout | undefined {

        switch (key) {
            case 'detected_urls':
                return new TableLayout(key, this.data[key],
                    [
                        ['positives', 'number'],
                        ['total', 'number'],
                        ['url', 'string|max_30'],
                        ['scan date', 'primary_date'],
                    ], (rowData => {
                        const {scan_date:date = DEF_DATE, positives, total, url} = rowData;
                        return [positives, total, url, date];
                    }));
            case 'undetected_urls':
                return new TableLayout(key, this.data[key],
                    [
                        ['positives', 'number'],
                        ['total', 'number'],
                        ['url', 'string|max_30'],
                        ['sha256', 'string|max_30'],
                        ['', linkOutColumn(value => `https://www.virustotal.com/gui/search/${value}`)],
                        ['scan date', 'primary_date'],
                    ], (rowData => {
                        const [url, sha256, positives, total, date = DEF_DATE] = rowData;
                        return [positives, total, url, sha256, sha256, date];
                    }));
            case 'resolutions':
                const tableData = this.data[key];
                if (!tableData?.[0]) return undefined;
                let display = 'host name';
                let valName = 'hostname';
                if (tableData[0].ip_address) {
                    display = 'ip address';
                    valName = 'ip_address';
                }
                return new TableLayout(key, tableData,
                    [
                    [display, 'string|max_40'],
                    ['scan date', 'primary_date'],
                ], (rowData => {
                    const {last_resolved:date = DEF_DATE, [valName]:val} = rowData;
                    return [val, date];
                }));
            case 'scans':
                return new TableLayout(key, this.data[key],
                    [
                        ['scan type', 'string'],
                        ['detected', 'boolean'],
                        ['result', {
                    genContents: value => <p style={value ? {color: typeColors.malicious, fontWeight: 'bold'} : {color: typeColors.null}}>{String(value)}</p>
                        }],
                        ['update', 'string'],
                        ['version', 'string'],
                    ], (rowData => {
                        const {scan, detected, result, update, version} = rowData;
                        return [scan, detected, result, update, version];
                    }), (data: any) => {
                        return Object.entries(data).map(([key, val]) => {
                            // @ts-ignore
                            const valTemp: any = val;
                            console.log('e', {scan: key, ...valTemp})
                            return {scan: key, ...valTemp};
                        });
                    });
        }

        if (key.endsWith('samples')) {
            return new TableLayout(key, this.data[key],
                [
                    ['positives', 'number'],
                    ['total', 'number'],
                    ['sha256', 'string|max_15'],
                    ['', linkOutColumn(value => `https://www.virustotal.com/gui/search/${value}`)],
                    ['time', 'primary_date'],
                ], (rowData => {
                    const {date = DEF_DATE, positives, total, sha256} = rowData;
                    return [positives, total, sha256, sha256, date];
                }));
        }
    }
}

export class CensysIntegration extends Integration {
    constructor(result: any, type: string) {
        super(result, type);
        this.imgSrc = './images/censysIcon.png';
    }

    genFlavorText(): string {
        if (Object.keys(this.data).length === 0) return '0';

        try {
            return this.data.protocols.length;
        } catch {
            return super.genFlavorText();
        }
    }
}

export class WhoisIntegration extends Integration {
    constructor(result: any) {
        super(result, integrationNames.WHOIS);
        this.imgSrc = './images/whoisIcon.svg';
    }
}

export class SpurIntegration extends Integration {
    constructor(result: any) {
        super(result, integrationNames.SPUR);
        this.imgSrc = './images/spur.png';
        this.imgStyle = {width: 60};
    }

    onAdd(indicatorNode: IndicatorNode) {
        super.onAdd(indicatorNode);
        tryUseASN(indicatorNode, this.type, this.data);
    }
}
