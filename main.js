const {
    app,
    BrowserWindow,
    desktopCapturer,
    screen,
    ipcMain,
    dialog,
    nativeImage,
    clipboard
} = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let screenSourceId = null;

async function createWindow() {

    const sources = await desktopCapturer.getSources({
        types: ['screen']
    });
    const primaryDisplay = screen.getPrimaryDisplay();
    const primarySource = sources.find(source =>

        (source.display_id && source.display_id == primaryDisplay.id.toString()) || source.name === 'Entire screen' || source.name === 'Screen 1'
    );

    if (!primarySource) {
        console.error("Could not find primary screen source!");
        app.quit();
        return;
    }
    screenSourceId = primarySource.id;
    console.log(`Found primary screen source: ID=${screenSourceId}, Name=${primarySource.name}`);

    mainWindow = new BrowserWindow({
        width: primaryDisplay.bounds.width,
        height: primaryDisplay.bounds.height,
        x: primaryDisplay.bounds.x,
        y: primaryDisplay.bounds.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        fullscreen: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        }
    });

    mainWindow.loadFile('index.html');
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.setFullScreen(true);
    mainWindow.focus();
}




ipcMain.handle('get-screen-source-id', async (event) => {
    return screenSourceId;
});


ipcMain.handle('save-capture', async (event, dataURL, defaultFilename) => {
    try {
        const {
            canceled,
            filePath
        } = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Screenshot',
            defaultPath: defaultFilename,
            filters: [{
                    name: 'PNG Images',
                    extensions: ['png']
                },
                {
                    name: 'JPEG Images',
                    extensions: ['jpg', 'jpeg']
                }
            ]
        });

        if (!canceled && filePath) {
            const image = nativeImage.createFromDataURL(dataURL);
            let imageData;
            let actualFilePath = filePath;


            const extension = path.extname(filePath).toLowerCase();
            if (extension === '.jpg' || extension === '.jpeg') {
                imageData = image.toJPEG(95);
            } else {
                imageData = image.toPNG();

                if (extension !== '.png') {
                    actualFilePath += '.png';
                }
            }

            fs.writeFileSync(actualFilePath, imageData);
            return {
                success: true,
                path: actualFilePath
            };
        } else {
            return {
                success: false,
                cancelled: true
            };
        }
    } catch (error) {
        console.error("Save error:", error);
        return {
            success: false,
            error: error.message
        };
    }
});


ipcMain.handle('copy-capture', async (event, dataURL) => {
    try {
        const image = nativeImage.createFromDataURL(dataURL);
        clipboard.writeImage(image);
        return {
            success: true
        };
    } catch (error) {
        console.error("Copy error:", error);
        return {
            success: false,
            error: error.message
        };
    }
});



app.whenReady().then(createWindow);

app.on('window-all-closed', () => {


    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {


    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});


app.on('browser-window-focus', () => {
});

app.on('browser-window-blur', () => {
});