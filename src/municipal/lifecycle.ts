import { MunicipalEvent, MunicipalLifecycleStatus, MunicipalProject } from './types.js';

const ALLOWED_TRANSITIONS: Record<MunicipalLifecycleStatus, Set<MunicipalLifecycleStatus>> = {
    UNKNOWN: new Set(['UNKNOWN', 'NEW_APPLICATION', 'SCHEDULED', 'HEARD', 'CONTINUED', 'APPROVED', 'DENIED', 'APPEAL', 'REVISED']),
    NEW_APPLICATION: new Set(['NEW_APPLICATION', 'SCHEDULED', 'HEARD', 'CONTINUED', 'APPROVED', 'DENIED', 'REVISED']),
    SCHEDULED: new Set(['SCHEDULED', 'HEARD', 'CONTINUED', 'APPROVED', 'DENIED', 'REVISED']),
    HEARD: new Set(['HEARD', 'CONTINUED', 'APPROVED', 'DENIED', 'REVISED']),
    CONTINUED: new Set(['SCHEDULED', 'HEARD', 'CONTINUED', 'APPROVED', 'DENIED', 'REVISED']),
    APPROVED: new Set(['APPROVED', 'APPEAL', 'REVISED']),
    DENIED: new Set(['DENIED', 'APPEAL', 'REVISED']),
    APPEAL: new Set(['APPEAL', 'HEARD', 'CONTINUED', 'APPROVED', 'DENIED', 'REVISED']),
    REVISED: new Set(['REVISED', 'SCHEDULED', 'HEARD', 'CONTINUED', 'APPROVED', 'DENIED', 'APPEAL']),
};

export function advanceMunicipalStatus(
    current: MunicipalLifecycleStatus,
    observed: MunicipalLifecycleStatus,
): MunicipalLifecycleStatus {
    if (observed === 'UNKNOWN' && current !== 'UNKNOWN') return current;
    return ALLOWED_TRANSITIONS[current].has(observed) ? observed : current;
}

function eventTime(event: MunicipalEvent): string {
    return event.meetingDate || event.retrievedAt;
}

export function rebuildMunicipalProjectState(project: MunicipalProject, events: MunicipalEvent[]): MunicipalProject {
    const ordered = events
        .filter(event => project.eventIds.includes(event.eventId))
        .sort((a, b) => eventTime(a).localeCompare(eventTime(b)) || a.eventId.localeCompare(b.eventId));
    let status: MunicipalLifecycleStatus = 'UNKNOWN';
    let decision: string | null = null;
    let nextHearingDate: string | null = null;
    for (const event of ordered) {
        const nextStatus = advanceMunicipalStatus(status, event.status);
        if (nextStatus !== status || status === 'UNKNOWN') {
            status = nextStatus;
            if (event.decision) decision = event.decision;
        }
        if (event.nextHearingDate) nextHearingDate = event.nextHearingDate;
        if (event.status === 'APPROVED' || event.status === 'DENIED') nextHearingDate = null;
    }
    return { ...project, currentStatus: status, currentDecision: decision, nextHearingDate };
}
