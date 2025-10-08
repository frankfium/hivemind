# Hivemind for Twitch

A Chrome extension that tracks trending chat messages on Twitch streams in real-time, allowing users to quickly copy popular messages to their chat input.

## Features

- **Real-time trending detection** - Automatically identifies the most popular chat messages
- **Instant message copying** - Add trending messages to your chat input with a single click or keyboard shortcut
- **Smart message parsing** - Works with both Twitch and 7TV emotes
- **Customizable settings** - Adjust thresholds, performance, and behavior
- **Minimal UI** - Clean, unobtrusive interface that doesn't interfere with your viewing
- **Privacy-focused** - All processing happens locally, no data collection

## Installation

### From Chrome Web Store
1. Visit the [Chrome Web Store listing](https://chrome.google.com/webstore) (when published)
2. Click "Add to Chrome"
3. Navigate to any Twitch stream to start using

### From Source (Development)
1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked" and select the extension folder
5. The extension will be loaded and ready to use

## Usage

### Basic Usage
1. **Navigate to any Twitch stream** with active chat
2. **Look for the Hivemind panel** next to the Follow button in the channel header
3. **View trending messages** - up to 4 trending messages will be displayed, numbered 1-4
4. **Copy messages** using either method below

### Copying Trending Messages

#### Method 1: Click to Copy
- Click on any trending message in the Hivemind panel
- The message will be automatically inserted into your chat input
- Press Enter to send, or modify the message as needed

#### Method 2: Keyboard Shortcuts
- **Shift + 1**: Insert the #1 trending message
- **Shift + 2**: Insert the #2 trending message  
- **Shift + 3**: Insert the #3 trending message
- **Shift + 4**: Insert the #4 trending message

### Panel Controls
- **Expand/Collapse**: Click anywhere on the panel to show/hide trending messages
- **Minimized by Default**: Panel starts collapsed to save space
- **Auto-positioning**: Automatically attaches to the channel header

## Settings

Click the extension icon in your browser toolbar to access the settings panel:

### Message Tracking
- **Spam Threshold** (2-10): How many times a message must appear to be considered "trending"
- **Max Entries** (2-8): Maximum number of trending messages to display
- **Window Duration** (1-15 min): How long to track messages before they expire
- **Max Messages** (50-500): Maximum messages to keep in memory

### Performance
- **Update Frequency** (25-200ms): How often the panel refreshes
- **Trim Interval** (2-10s): How often old messages are cleaned up

### Interface
- **Start Minimized**: Whether the panel starts collapsed or expanded
- **Show Empty State**: Whether to show "..." when no messages are trending

## Compatibility

- **Works with**: Standard Twitch chat and 7TV extension
- **Browser Support**: Chrome and Chromium-based browsers
- **Stream Types**: All Twitch streams with active chat
- **No Account Required**: Works without logging into Twitch

## Privacy & Security

- **No Data Collection**: All processing happens locally in your browser
- **No Network Requests**: Doesn't send any data to external servers
- **No User Tracking**: No analytics or user behavior monitoring
- **Open Source**: Full source code available for transparency
- **Local Storage Only**: Settings stored locally using Chrome's storage API

## Development

### Project Structure
```
hivemind/
├── manifest.json          # Extension manifest
├── content.js            # Main content script
├── popup.html            # Settings popup HTML
├── popup.js              # Settings popup JavaScript
├── panel.css             # Panel styling
├── icon.png              # Extension icon
├── temp.png              # Panel icon
├── LICENSE               # GPL v3 license
└── README.md             # This file
```

### Building
No build process required - the extension runs directly from source files.

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on Twitch streams
5. Submit a pull request

### Code Style
- Use consistent indentation (2 spaces)
- Comment complex logic
- Follow existing naming conventions
- Test on both standard Twitch and 7TV-enhanced chat

## Troubleshooting

### Panel not appearing?
- Refresh the Twitch page
- Check that the extension is enabled
- Try disabling other Twitch extensions temporarily
- Ensure you're on a Twitch stream page

### Messages not updating?
- Check your spam threshold setting (try lowering it)
- Ensure the stream has active chat
- Refresh the page to restart the extension
- Check browser console for errors

### Keyboard shortcuts not working?
- Make sure you're on the Twitch page
- Check that no other extension is using the same shortcuts
- Try clicking on the page first to ensure focus
- Ensure the extension is enabled

### Performance issues?
- Increase the update frequency in settings
- Reduce the max messages limit
- Close other browser tabs to free up memory
- Check for conflicting extensions

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Changelog

### Version 1.0
- Initial release
- Real-time trending message detection
- Click and keyboard shortcut copying
- Customizable settings panel
- 7TV and standard Twitch compatibility
- Privacy-focused design

## Support

- **Issues**: Report bugs and request features on the GitHub repository
- **Questions**: Check the troubleshooting section above
- **Contributions**: Pull requests welcome!

## Acknowledgments

- Built for the Twitch streaming community
- Compatible with 7TV extension for enhanced emote support
- Inspired by the need for better chat engagement tools
