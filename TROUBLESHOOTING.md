# 🐛 Woodmont RSS Feed - Troubleshooting Guide

## GUI Application Issues

### **"Python not found" Error**

#### **Symptoms:**
- `launch_gui.bat` shows "PYTHON NOT FOUND"
- GUI won't start

#### **Solutions:**

1. **Check Python Installation:**
   ```bash
   # Run the diagnostic script
   test_python.bat
   ```

2. **Reinstall Python with PATH:**
   - Uninstall current Python
   - Download from: https://python.org/downloads/
   - **IMPORTANT**: Check "Add Python to PATH" during installation
   - **RESTART** your computer after installation

3. **Manual PATH Setup:**
   - Find your Python installation (usually `C:\Users\Username\AppData\Local\Programs\Python\Python311\`)
   - Add to Windows PATH environment variable
   - Restart command prompt

### **GUI Starts But Shows Errors**

#### **Symptoms:**
- Python found but GUI crashes
- Tkinter import errors
- Permission errors

#### **Solutions:**

1. **Check Tkinter Installation:**
   ```bash
   py -c "import tkinter; print('tkinter OK')"
   ```

2. **Reinstall Python from python.org:**
   - Microsoft Store Python may lack tkinter
   - python.org installer includes tkinter by default

3. **Run with Full Path:**
   ```bash
   "C:\Program Files\Python311\python.exe" server_manager.py
   ```

### **Server Won't Start from GUI**

#### **Symptoms:**
- GUI loads but server operations fail
- "Failed to start server" errors

#### **Solutions:**

1. **Check Node.js Installation:**
   ```bash
   node --version
   npm --version
   ```

2. **Check Port Availability:**
   ```bash
   netstat -an | find ":8080"
   ```

3. **Kill Conflicting Processes:**
   ```bash
   # Find process using port 8080
   netstat -aon | find ":8080"
   # Kill the process (replace XXXX with PID)
   taskkill /f /pid XXXX
   ```

## Command-Line Interface Issues

### **Server.bat Shows Garbled Text**

#### **Symptoms:**
- Unicode characters appear as `ΓûêΓûêΓûêΓòù`

#### **Solution:**
- This is normal in older Windows terminals
- The interface still works, just displays differently
- Consider using Windows Terminal for better Unicode support

### **Server Starts But Browser Doesn't Open**

#### **Solutions:**

1. **Manual Browser Access:**
   - Open browser manually
   - Navigate to: `http://localhost:8080`

2. **Check Browser Settings:**
   - Some browsers block localhost auto-open
   - Try different browser (Chrome, Firefox, Edge)

## RSS Feed Issues

### **"No articles found"**

#### **Possible Causes:**
- Network connectivity issues
- RSS sources temporarily down
- Strict filtering blocking all content

#### **Solutions:**

1. **Check Network:**
   ```bash
   ping google.com
   ```

2. **Manual Feed Check:**
   ```bash
   curl -I https://www.bisnow.com/rss-feed/new-jersey
   ```

3. **Run Build Manually:**
   ```bash
   npm run build
   ```

### **Old Articles Showing**

#### **Solution:**
- The system caches articles for performance
- Force fresh fetch by restarting server
- Or wait for next automatic update (30 minutes)

## GitHub Actions Issues

### **Workflow Not Running**

#### **Check:**
1. Go to repository → **Actions** tab
2. Check if workflows are enabled
3. Verify cron schedule: `*/30 * * * *`

### **Build Failing in Actions**

#### **Common Issues:**
- Node.js version mismatch
- Missing dependencies
- Network timeouts

#### **Check Logs:**
- Go to Actions → Failed run → View details
- Check error messages in build log

## Performance Issues

### **Server Running Slow**

#### **Solutions:**
1. **Check System Resources:**
   ```bash
   taskmgr  # Windows Task Manager
   ```

2. **Reduce Feed Count:**
   - Edit `rssFeeds` array in `rssfeed.ts`
   - Comment out some feeds temporarily

3. **Increase Timeouts:**
   - Edit timeout values in feed configurations

## Getting Help

### **Diagnostic Tools:**

1. **Run All Diagnostics:**
   ```bash
   test_python.bat    # Check Python setup
   find_python.bat    # Find Python installations
   server.bat         # Test command-line interface
   ```

2. **Check Logs:**
   - `server.log` - Server activity
   - GitHub Actions logs - Build issues

3. **System Info:**
   ```bash
   systeminfo | findstr /C:"OS"
   node --version
   npm --version
   ```

### **Contact Support:**
- 📧 operationssupport@woodmontproperties.com
- Include diagnostic output when reporting issues
- Mention your Windows version and Python installation method

## Quick Reference

### **Start Server:**
```bash
# GUI (recommended)
launch_gui.bat

# Command line
server.bat

# Manual
npm start
```

### **Test Everything:**
```bash
# Python diagnostics
test_python.bat

# Build test
npm run build

# Manual server start
npm start
```

### **Reset Everything:**
```bash
# Clear logs
del server.log

# Clear cache
del articles.json

# Fresh start
npm run build
```
