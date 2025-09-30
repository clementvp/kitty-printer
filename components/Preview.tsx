import { createRef } from "preact";
import { MXW01_PRINT_SRV, MXW01_CONTROL_CHAR, MXW01_NOTIFY_CHAR, MXW01_DATA_CHAR, DEF_CANVAS_WIDTH, DEF_INTENSITY, STUFF_PAINT_INIT_URL } from "../common/constants.ts";
import { BitmapData, PrinterProps } from "../common/types.ts";
import StuffPreview from "./StuffPreview.tsx";
import { useMemo, useReducer } from "preact/hooks";
import { Icons } from "../common/icons.tsx";
import { _ } from "../common/i18n.tsx";
import { MXW01Printer, PRINTER_WIDTH, prepareImageDataBuffer } from "../common/mxw01-protocol.ts";
import { delay } from "$std/async/delay.ts";
import Settings from "./Settings.tsx";
import { useState } from "preact/hooks";

declare let navigator: Navigator & {
    // deno-lint-ignore no-explicit-any
    bluetooth: any;
};



export default function Preview(props: PrinterProps) {
    const [bitmap_data, dispatch] = useReducer<Record<number, BitmapData>, BitmapData>((data, update) => {
        data[update.index] = update;
        return data;
    }, {});

    const [settingsVisible, setSettingsVisible] = useState(false)

    const stuffs = props.stuffs;
    if (stuffs.length === 0)
        return <div class="kitty-preview">
            <img src={STUFF_PAINT_INIT_URL} width={DEF_CANVAS_WIDTH} height={1} />
        </div>;
    const preview_ref = createRef();
    const preview = <div ref={preview_ref} class="kitty-preview">
        {stuffs.map((stuff, index) =>
            useMemo(() =>
                <StuffPreview stuff={stuff} index={index} dispatch={dispatch} width={DEF_CANVAS_WIDTH} />
                , [JSON.stringify(stuff)])
        )}
    </div>;
    const print = async () => {
        const intensity = +(localStorage.getItem("intensity") || DEF_INTENSITY);

        const device = await navigator.bluetooth.requestDevice({
            filters: [
                { services: ["0000ae30-0000-1000-8000-00805f9b34fb"] },
                { services: ["0000af30-0000-1000-8000-00805f9b34fb"] },
            ],
            optionalServices: [MXW01_PRINT_SRV]
        });
        const server = await device.gatt.connect();
        try {
            const service = await server.getPrimaryService(MXW01_PRINT_SRV);
            const [controlChar, notifyChar, dataChar] = await Promise.all([
                service.getCharacteristic(MXW01_CONTROL_CHAR),
                service.getCharacteristic(MXW01_NOTIFY_CHAR),
                service.getCharacteristic(MXW01_DATA_CHAR)
            ]);

            const printer = new MXW01Printer(
                controlChar.writeValueWithoutResponse.bind(controlChar),
                dataChar.writeValueWithoutResponse.bind(dataChar),
                false
            );

            const notifier = (event: Event) => {
                //@ts-ignore:
                const data: DataView = event.target.value;
                const message = new Uint8Array(data.buffer);
                printer.notify(message);
            };

            // Start notifications
            await notifyChar.startNotifications()
                .then(() => notifyChar.addEventListener('characteristicvaluechanged', notifier))
                .catch((error: Error) => console.log(error));

            // Convert bitmap data to boolean rows
            const allRowsBool: boolean[][] = [];
            for (const stuff of stuffs) {
                const data = bitmap_data[stuff.id];
                const imgData = new Uint32Array(data.data.buffer);

                for (let y = 0; y < data.height; y++) {
                    const row = new Array(PRINTER_WIDTH).fill(false);
                    for (let x = 0; x < data.width && x < PRINTER_WIDTH; x++) {
                        const idx = y * data.width + x;
                        // Check if pixel is black (alpha channel and luminance)
                        const lum = imgData[idx] & 0xff;
                        row[x] = lum < 128;
                    }
                    allRowsBool.push(row);
                }
            }

            // Rotate 180° (reverse rows and reverse each row)
            const rotatedRows = allRowsBool.reverse().map(row => row.slice().reverse());

            // Prepare image data buffer with padding
            const imageBuffer = prepareImageDataBuffer(rotatedRows);
            const height = rotatedRows.length;

            // 1) Set intensity
            await printer.setIntensity(intensity);

            // 2) Request status and wait for response
            const statusPayload = await printer.requestStatus();
            if (statusPayload.length >= 13 && statusPayload[12] !== 0) {
                const errCode = statusPayload[13];
                throw new Error(`Printer error: ${errCode}`);
            }

            // 3) Send print request with number of lines
            const printAck = await printer.printRequest(height, 0);
            if (!printAck || printAck[0] !== 0) {
                throw new Error('Print request rejected: ' + (printAck ? printAck[0] : 'no response'));
            }

            // 4) Transfer image data in chunks
            await printer.sendDataChunks(imageBuffer);

            // 5) Flush data
            await printer.flushData();

            // 6) Wait for print complete
            await printer.waitForPrintComplete();

            await notifyChar.stopNotifications().then(() => notifyChar.removeEventListener('characteristicvaluechanged', notifier));
        } finally {
            await delay(500);
            if (server) server.disconnect();
        }
    };
    const print_menu = <div>
        <div class="print-menu">
            <button class="stuff stuff--button" style={{ width: "80%" }} aria-label={_('print')} onClick={print} data-key="Enter">
                <Icons.IconPrinter />
            </button>
            <button class="stuff stuff--button" style={{ width: "20%" }} aria-label={_('settings')} onClick={() => setSettingsVisible(!settingsVisible)} data-key="\">
                <Icons.IconSettings />
            </button>
        </div>
        <Settings visible={settingsVisible} />
    </div>;
    return <>
        {preview}
        {print_menu}
    </>;
}
