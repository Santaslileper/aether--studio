export function fmtTime(s) {
    if (isNaN(s)) return '0:00';
    return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}

export function countConsecutive(notes, from) {
    const n = notes[from].note; let c=1;
    while (from+c < notes.length && notes[from+c].note===n) c++;
    return c;
}

export function getShiftedNote(note, shift) {
    if (!note || ['SUSTAIN','VB_PEDAL','SOFT_PEDAL'].includes(note)) return note;
    const m = note.match(/^([A-G]#?)(\d)$/);
    if (!m) return note;
    const oct = parseInt(m[2]) + shift;
    if (oct < 0 || oct > 8) return null;
    if (oct === 8 && m[1] !== 'C') return null;
    return `${m[1]}${oct}`;
}
