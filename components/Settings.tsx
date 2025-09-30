import { DEF_INTENSITY, INTENSITY_RANGE } from "../common/constants.ts";
import { useLocalStorage } from "../common/hooks.ts";
import { _ } from "../common/i18n.tsx";

export default function ({ visible }: { visible: boolean }) {
    const [intensity, set_intensity] = useLocalStorage<number>('intensity', DEF_INTENSITY);

    const mkset = (f: (value: number) => void) => (e: Event) => f(+(e.target as HTMLInputElement).value);

    return <div className={`${visible ? "print__options-container--visible" : ""} print__options-container`}>
        <div className="stuff__option">
            <span className="option__title">{_('strength')}</span>
            {Object.entries(INTENSITY_RANGE).map(([label, intensity_]) => <button className="option__item" value={intensity_}
                onClick={() => set_intensity(intensity_)} data-key={visible ? "" : undefined}
                data-selected={intensity === intensity_}>
                <span className="stuff__label">{_(label)}</span>
            </button>)}

            <input className="option__item" type="number" min={0} max={0xFF} value={intensity} onInput={mkset(set_intensity)} data-key={visible ? "" : undefined} />
        </div>
    </div>;
}
