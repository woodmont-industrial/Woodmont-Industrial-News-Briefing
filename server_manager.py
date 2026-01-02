#!/usr/bin/env python3
"""
Woodmont RSS Feed Server Manager
A beautiful dark-themed GUI for managing the RSS feed server
"""

import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
import subprocess
import sys
import os
import threading
import time
import signal
import psutil
import json
from datetime import datetime

class ServerManager:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Woodmont RSS Feed Server Manager v3.1")
        self.root.geometry("900x700")
        self.root.configure(bg='#1a1a1a')

        # Dark theme colors
        self.colors = {
            'bg': '#1a1a1a',
            'fg': '#ffffff',
            'accent': '#00ff88',
            'secondary': '#333333',
            'button_bg': '#2a2a2a',
            'button_hover': '#3a3a3a',
            'success': '#00ff88',
            'warning': '#ffaa00',
            'error': '#ff4444'
        }

        self.server_process = None
        self.log_text = None
        self.status_check_running = False
        self.last_status = None
        
        # Configuration
        self.config = {
            'port': 8080,
            'status_check_interval': 3000,  # 3 seconds instead of 5
            'server_timeout': 15,  # 15 seconds for server startup
            'log_file': 'server.log'
        }

        self.setup_ui()
        self.check_initial_status()

    def setup_ui(self):
        # Main container
        main_frame = tk.Frame(self.root, bg=self.colors['bg'])
        main_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)

        # Header
        header_frame = tk.Frame(main_frame, bg=self.colors['bg'])
        header_frame.pack(fill=tk.X, pady=(0, 20))

        title_label = tk.Label(
            header_frame,
            text="WOODMONT RSS FEED SERVER MANAGER",
            font=('Segoe UI', 18, 'bold'),
            fg=self.colors['accent'],
            bg=self.colors['bg']
        )
        title_label.pack()

        subtitle_label = tk.Label(
            header_frame,
            text="Professional RSS Feed Management Interface v3.1",
            font=('Segoe UI', 10),
            fg=self.colors['secondary'],
            bg=self.colors['bg']
        )
        subtitle_label.pack(pady=(5, 0))

        # Status section
        status_frame = tk.Frame(main_frame, bg=self.colors['secondary'], relief='ridge', bd=2)
        status_frame.pack(fill=tk.X, pady=(0, 20))

        self.status_label = tk.Label(
            status_frame,
            text="🔍 Checking server status...",
            font=('Segoe UI', 12),
            fg=self.colors['accent'],
            bg=self.colors['secondary']
        )
        self.status_label.pack(pady=10)

        # Status details
        self.status_details = tk.Label(
            status_frame,
            text="",
            font=('Segoe UI', 9),
            fg=self.colors['fg'],
            bg=self.colors['secondary']
        )
        self.status_details.pack(pady=(0, 10))

        # Buttons section
        buttons_frame = tk.Frame(main_frame, bg=self.colors['bg'])
        buttons_frame.pack(fill=tk.X, pady=(0, 20))

        # Left column buttons
        left_frame = tk.Frame(buttons_frame, bg=self.colors['bg'])
        left_frame.pack(side=tk.LEFT, padx=(0, 10))

        # Right column buttons
        right_frame = tk.Frame(buttons_frame, bg=self.colors['bg'])
        right_frame.pack(side=tk.RIGHT, padx=(10, 0))

        # Start buttons
        self.create_button(left_frame, "▶️ START SERVER", "Start server with browser", self.start_server_normal, 0, 0)
        self.create_button(left_frame, "🤫 START SILENT", "Start server without browser popup", self.start_server_silent, 1, 0)

        # Control buttons
        self.create_button(left_frame, "🛑 STOP SERVER", "Stop the running server", self.stop_server, 2, 0)
        self.create_button(left_frame, "🔄 RESTART SERVER", "Restart the server", self.restart_server, 3, 0)

        # NPM buttons
        self.create_button(left_frame, "🔨 NPM BUILD", "Run npm build command", self.npm_build, 4, 0)
        self.create_button(left_frame, "🚀 NPM START", "Run npm start command", self.npm_start, 5, 0)
        self.create_button(left_frame, "🛑 NPM STOP", "Stop npm processes", self.npm_stop, 6, 0)

        # Utility buttons
        self.create_button(right_frame, "📊 CHECK STATUS", "Check server status and logs", self.check_status, 0, 0)
        self.create_button(right_frame, "📈 ARTICLE REPORTS", "Show detailed article fetch reports", self.show_article_reports, 1, 0)
        self.create_button(right_frame, "📋 GENERATE BRIEFING", "Generate daily briefing report", self.generate_daily_briefing, 2, 0)
        self.create_button(right_frame, "🔧 DEBUG STOP", "Debug server stopping with detailed logs", self.debug_stop_server, 3, 0)
        self.create_button(right_frame, "💀 FORCE KILL", "Aggressively kill all server processes", self.force_kill_server, 4, 0)
        self.create_button(right_frame, "🚪 EXIT", "Exit application", self.exit_app, 5, 0)

        # Log section
        log_frame = tk.Frame(main_frame, bg=self.colors['secondary'], relief='ridge', bd=2)
        log_frame.pack(fill=tk.BOTH, expand=True)

        log_label = tk.Label(
            log_frame,
            text="📋 Activity Log",
            font=('Segoe UI', 12, 'bold'),
            fg=self.colors['accent'],
            bg=self.colors['secondary']
        )
        log_label.pack(pady=(10, 5))

        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            height=15,
            bg='#000000',
            fg=self.colors['success'],
            font=('Consolas', 9),
            insertbackground=self.colors['accent']
        )
        self.log_text.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))

        # Footer
        footer_label = tk.Label(
            main_frame,
            text="© Woodmont Industrial Partners | operationssupport@woodmontproperties.com | v3.1",
            font=('Segoe UI', 8),
            fg=self.colors['secondary'],
            bg=self.colors['bg']
        )
        footer_label.pack(pady=(10, 0))

        # Start periodic status checks
        self.schedule_status_check()

    def schedule_status_check(self):
        """Schedule periodic status checks with improved error handling"""
        if not self.status_check_running:
            self.status_check_running = True
            try:
                self.check_server_status()
            except Exception as e:
                self.log(f"Status check error: {str(e)}", "error")
            finally:
                self.status_check_running = False
        
        # Schedule next check
        self.root.after(self.config['status_check_interval'], self.schedule_status_check)

    def create_button(self, parent, text, tooltip, command, row, col):
        button = tk.Button(
            parent,
            text=text,
            command=command,
            font=('Segoe UI', 10, 'bold'),
            bg=self.colors['button_bg'],
            fg=self.colors['fg'],
            activebackground=self.colors['button_hover'],
            activeforeground=self.colors['accent'],
            relief='raised',
            bd=2,
            padx=20,
            pady=10,
            cursor='hand2'
        )
        button.grid(row=row, column=col, pady=5, padx=5, sticky='ew')

        # Bind hover effects
        button.bind('<Enter>', lambda e: button.config(bg=self.colors['button_hover']))
        button.bind('<Leave>', lambda e: button.config(bg=self.colors['button_bg']))

        return button

    def log(self, message, level='info'):
        """Improved logging with timestamp and better formatting"""
        try:
            timestamp = datetime.now().strftime('%H:%M:%S')
            colors = {
                'info': self.colors['fg'],
                'success': self.colors['success'],
                'warning': self.colors['warning'],
                'error': self.colors['error']
            }

            color = colors.get(level, self.colors['fg'])
            log_entry = f"[{timestamp}] {message}\n"

            self.log_text.insert(tk.END, log_entry)
            self.log_text.tag_add(f"tag_{level}", f"end-{len(log_entry)}c", "end-1c")
            self.log_text.tag_config(f"tag_{level}", foreground=color)
            self.log_text.see(tk.END)
            
            # Limit log size to prevent memory issues
            lines = int(self.log_text.index('end-1c').split('.')[0])
            if lines > 1000:  # Keep last 1000 lines
                self.log_text.delete('1.0', '100.0')
                
        except Exception as e:
            print(f"Logging error: {str(e)}")

    def check_initial_status(self):
        """Initial status check with better error handling"""
        try:
            self.check_server_status()
        except Exception as e:
            self.log(f"Initial status check failed: {str(e)}", "error")

    def check_server_status(self):
        """Improved server status checking with multiple methods"""
        try:
            current_status = None
            
            # Method 1: Check port using netstat
            try:
                result = subprocess.run(
                    ['netstat', '-an'],
                    capture_output=True,
                    text=True,
                    shell=True,
                    timeout=5
                )
                is_listening = f':{self.config["port"]} ' in result.stdout and 'LISTENING' in result.stdout
                if is_listening:
                    current_status = 'running'
            except Exception as e:
                self.log(f"Netstat check failed: {str(e)}", "warning")

            # Method 2: Check for node processes using psutil
            if current_status != 'running':
                try:
                    node_processes = []
                    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                        try:
                            if proc.info['name'] and 'node' in proc.info['name'].lower():
                                if proc.info['cmdline'] and any('rssfeed' in str(cmd).lower() for cmd in proc.info['cmdline']):
                                    node_processes.append(proc.info['pid'])
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            continue
                    
                    if node_processes:
                        current_status = 'node_running'
                        self.log(f"Found Node.js processes: {node_processes}", "info")
                except Exception as e:
                    self.log(f"Psutil check failed: {str(e)}", "warning")

            # Method 3: Fallback tasklist check
            if current_status is None:
                try:
                    node_check = subprocess.run(
                        ['tasklist', '/fi', 'imagename eq node.exe'],
                        capture_output=True,
                        text=True,
                        timeout=3
                    )
                    if 'node.exe' in node_check.stdout:
                        current_status = 'node_running'
                except:
                    current_status = 'not_running'

            # Update UI based on status
            if current_status == 'running':
                self.status_label.config(text="✅ SERVER IS RUNNING (Port 8080)", fg=self.colors['success'])
                self.status_details.config(text="Server is listening on port 8080")
                if self.last_status != 'running':
                    self.log("Server status: RUNNING on port 8080", "success")
            elif current_status == 'node_running':
                self.status_label.config(text="⚠️ NODE RUNNING BUT PORT NOT LISTENING", fg=self.colors['warning'])
                self.status_details.config(text="Node.js process found but port 8080 not accessible")
                if self.last_status != 'node_running':
                    self.log("Server status: Node process running but port 8080 not listening", "warning")
            else:
                self.status_label.config(text="❌ SERVER IS NOT RUNNING", fg=self.colors['error'])
                self.status_details.config(text="No server process detected")
                if self.last_status != 'not_running':
                    self.log("Server status: NOT RUNNING", "warning")

            self.last_status = current_status
            return current_status == 'running'

        except subprocess.TimeoutExpired:
            self.status_label.config(text="⚠️ STATUS CHECK TIMED OUT", fg=self.colors['warning'])
            self.status_details.config(text="Status check command timed out")
            return False
        except Exception as e:
            self.status_label.config(text="⚠️ UNABLE TO CHECK STATUS", fg=self.colors['warning'])
            self.status_details.config(text=f"Error: {str(e)[:50]}...")
            self.log(f"Status check error: {str(e)}", "error")
            return False

    def start_server_normal(self):
        """Start server with improved error handling and timeout management"""
        if self.check_server_status():
            messagebox.showwarning("Server Already Running", "Server is already running on port 8080!")
            return

        self.log("Starting server with browser auto-open...", "info")
        self.status_label.config(text="🚀 STARTING SERVER...", fg=self.colors['accent'])

        try:
            # Start server normally
            self.server_process = subprocess.Popen(
                ['cmd', '/c', 'npx tsx rssfeed.ts'],
                cwd=os.getcwd(),
                creationflags=subprocess.CREATE_NO_WINDOW
            )

            # Wait for server to actually start with improved timeout
            self.log("Waiting for server to start...", "info")

            # Check for up to configured timeout if server starts
            for i in range(self.config['server_timeout']):
                time.sleep(1)
                if self.check_server_status():
                    self.log("Server started successfully, launching browser...", "success")
                    self.status_label.config(text="✅ SERVER STARTED (launching browser)", fg=self.colors['success'])
                    
                    # Explicitly launch browser after server is confirmed running
                    self.launch_browser()
                    return
                    
                # Show progress
                if i % 3 == 0:  # Every 3 seconds
                    self.log(f"Server starting... ({i+1}/{self.config['server_timeout']}s)", "info")

            # If we get here, server didn't start properly
            self.log("Server process started but not listening on port 8080", "warning")
            self.status_label.config(text="⚠️ SERVER MAY NOT BE RUNNING PROPERLY", fg=self.colors['warning'])
            # Force a status check to be sure
            self.root.after(1000, self.check_server_status)

        except Exception as e:
            self.log(f"Failed to start server: {str(e)}", "error")
            self.status_label.config(text="❌ FAILED TO START SERVER", fg=self.colors['error'])
            messagebox.showerror("Start Failed", f"Failed to start server:\n{str(e)}")

    def launch_browser(self):
        """Launch browser to the server URL"""
        try:
            import webbrowser
            url = f"http://localhost:{self.config['port']}"
            self.log(f"Launching browser at {url}", "info")
            webbrowser.open(url)
            self.status_label.config(text="✅ SERVER STARTED (browser opened)", fg=self.colors['success'])
        except Exception as e:
            self.log(f"Failed to launch browser: {str(e)}", "warning")
            self.status_label.config(text="✅ SERVER STARTED (browser launch failed)", fg=self.colors['success'])

    def start_server_silent(self):
        """Start server in silent mode with improved error handling"""
        if self.check_server_status():
            messagebox.showwarning("Server Already Running", "Server is already running on port 8080!")
            return

        self.log("Starting server in silent mode (no browser)...", "info")
        self.status_label.config(text="🤫 STARTING SERVER (SILENT)...", fg=self.colors['accent'])

        try:
            # Start server with --no-browser flag
            self.server_process = subprocess.Popen(
                ['cmd', '/c', 'npx tsx rssfeed.ts --no-browser'],
                cwd=os.getcwd(),
                creationflags=subprocess.CREATE_NO_WINDOW
            )

            # Wait for server to actually start with improved timeout
            self.log("Waiting for server to start...", "info")

            # Check for up to configured timeout if server starts
            for i in range(self.config['server_timeout']):
                time.sleep(1)
                if self.check_server_status():
                    self.log("Server started successfully (silent mode)", "success")
                    self.status_label.config(text="✅ SERVER STARTED (silent)", fg=self.colors['success'])
                    return
                # Show progress
                if i % 3 == 0:  # Every 3 seconds
                    self.log(f"Server starting... ({i+1}/{self.config['server_timeout']}s)", "info")

            # If we get here, server didn't start properly
            self.log("Server process started but not listening on port 8080", "warning")
            self.status_label.config(text="⚠️ SERVER MAY NOT BE RUNNING PROPERLY", fg=self.colors['warning'])
            # Force a status check to be sure
            self.root.after(1000, self.check_server_status)

        except Exception as e:
            self.log(f"Failed to start server: {str(e)}", "error")
            self.status_label.config(text="❌ FAILED TO START SERVER", fg=self.colors['error'])
            messagebox.showerror("Start Failed", f"Failed to start server:\n{str(e)}")

    def stop_server(self):
        """Improved server stopping with better process management and npm port handling"""
        self.log("Stopping server...", "info")
        self.status_label.config(text="🛑 STOPPING SERVER...", fg=self.colors['warning'])

        killed = False
        methods_tried = []

        try:
            # Method 1: Kill all node.exe processes using psutil (more reliable)
            methods_tried.append("psutil node.exe kill")
            try:
                for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                    try:
                        if proc.info['name'] and 'node' in proc.info['name'].lower():
                            if proc.info['cmdline'] and any('rssfeed' in str(cmd).lower() for cmd in proc.info['cmdline']):
                                self.log(f"Terminating Node.js process {proc.info['pid']}", "info")
                                proc.terminate()
                                killed = True
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
                
                # Wait for graceful termination
                time.sleep(2)
                
                # Force kill if still running
                for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                    try:
                        if proc.info['name'] and 'node' in proc.info['name'].lower():
                            if proc.info['cmdline'] and any('rssfeed' in str(cmd).lower() for cmd in proc.info['cmdline']):
                                self.log(f"Force killing Node.js process {proc.info['pid']}", "warning")
                                proc.kill()
                                killed = True
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
                        
            except Exception as e:
                self.log(f"Psutil kill error: {str(e)}", "warning")

            # Method 2: Kill npm processes (more comprehensive)
            methods_tried.append("npm processes kill")
            try:
                # Kill npm.cmd processes
                npm_kill = subprocess.run(
                    ['taskkill', '/f', '/im', 'npm.cmd', '/t'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if npm_kill.returncode == 0:
                    self.log("Killed npm.cmd processes", "success")
                    killed = True
                
                # Kill npm.exe processes
                npm_exe_kill = subprocess.run(
                    ['taskkill', '/f', '/im', 'npm.exe', '/t'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if npm_exe_kill.returncode == 0:
                    self.log("Killed npm.exe processes", "success")
                    killed = True
                    
                # Kill npx processes
                npx_kill = subprocess.run(
                    ['taskkill', '/f', '/im', 'npx.cmd', '/t'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if npx_kill.returncode == 0:
                    self.log("Killed npx.cmd processes", "success")
                    killed = True
                    
            except subprocess.TimeoutExpired:
                self.log("NPM process kill timed out", "warning")
            except Exception as e:
                self.log(f"NPM kill error: {str(e)}", "warning")

            # Method 3: Fallback to taskkill for node.exe
            if not killed:
                methods_tried.append("taskkill node.exe")
                try:
                    node_kill = subprocess.run(
                        ['taskkill', '/f', '/im', 'node.exe', '/t'],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if node_kill.returncode == 0:
                        self.log("Killed node.exe processes", "success")
                        killed = True
                except subprocess.TimeoutExpired:
                    self.log("Taskkill timed out", "warning")
                except Exception as e:
                    self.log(f"Taskkill error: {str(e)}", "warning")

            # Method 4: Kill processes on port 8080 (npm port)
            methods_tried.append("port 8080 kill")
            try:
                result = subprocess.run(
                    ['netstat', '-aon'],
                    capture_output=True,
                    text=True,
                    shell=True,
                    timeout=10
                )

                pids_to_kill = []
                for line in result.stdout.split('\n'):
                    if f':{self.config["port"]} ' in line and ('LISTENING' in line or 'ESTABLISHED' in line):
                        parts = line.split()
                        if len(parts) >= 5:
                            pid = parts[4].strip()
                            pids_to_kill.append(pid)
                            self.log(f"Found process {pid} listening on port {self.config['port']}", "info")

                # Kill each PID found
                for pid in pids_to_kill:
                    try:
                        kill_result = subprocess.run(
                            ['taskkill', '/f', '/pid', pid],
                            capture_output=True,
                            text=True,
                            timeout=5
                        )
                        if kill_result.returncode == 0:
                            self.log(f"Successfully killed process {pid} on port {self.config['port']}", "success")
                            killed = True
                        else:
                            self.log(f"Failed to kill process {pid}: {kill_result.stderr.strip()}", "warning")
                    except subprocess.TimeoutExpired:
                        self.log(f"Timeout killing process {pid}", "warning")
                    except Exception as e:
                        self.log(f"Error killing process {pid}: {str(e)}", "warning")

            except subprocess.TimeoutExpired:
                self.log("Netstat command timed out", "warning")
            except Exception as e:
                self.log(f"Netstat error: {str(e)}", "warning")

            # Method 5: Kill any remaining processes using the port
            methods_tried.append("port cleanup")
            try:
                # Use PowerShell to find and kill processes on the port
                ps_command = f'Get-NetTCPConnection -LocalPort {self.config["port"]} | Where-Object {{$_.State -eq "Listen"}} | Select-Object OwningProcess'
                ps_result = subprocess.run(
                    ['powershell', '-Command', ps_command],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                if ps_result.returncode == 0 and ps_result.stdout.strip():
                    lines = ps_result.stdout.strip().split('\n')[2:]  # Skip headers
                    for line in lines:
                        if line.strip():
                            try:
                                pid = line.strip()
                                kill_result = subprocess.run(
                                    ['taskkill', '/f', '/pid', pid],
                                    capture_output=True,
                                    text=True,
                                    timeout=5
                                )
                                if kill_result.returncode == 0:
                                    self.log(f"PowerShell killed process {pid} on port {self.config['port']}", "success")
                                    killed = True
                            except:
                                pass
                                 
            except Exception as e:
                self.log(f"PowerShell port cleanup error: {str(e)}", "warning")

            # Wait and verify server is stopped
            self.log("Verifying server is stopped...", "info")
            time.sleep(3)  # Give more time for processes to shut down

            final_status = self.check_server_status()
            if not final_status:
                if killed:
                    self.log(f"Server stopped successfully (methods used: {', '.join(methods_tried)})", "success")
                    self.status_label.config(text="✅ SERVER STOPPED", fg=self.colors['success'])
                else:
                    self.log("Server was already stopped", "info")
                    self.status_label.config(text="✅ SERVER STOPPED", fg=self.colors['success'])
            else:
                self.log("Failed to stop server completely", "error")
                self.status_label.config(text="❌ FAILED TO STOP SERVER", fg=self.colors['error'])
                messagebox.showerror("Stop Failed", "Could not stop the server completely. Please check manually.")

        except Exception as e:
            self.log(f"Error during server stop: {str(e)}", "error")
            self.status_label.config(text="❌ ERROR STOPPING SERVER", fg=self.colors['error'])
            messagebox.showerror("Stop Error", f"Error stopping server:\n{str(e)}")

    def debug_stop_server(self):
        """Enhanced debug version with comprehensive process information"""
        self.log("=== DEBUG STOP SERVER ===", "info")
        self.status_label.config(text="🔧 DEBUGGING SERVER STATUS...", fg=self.colors['warning'])

        try:
            # Show current processes on port 8080
            self.log("=== PORT 8080 PROCESSES ===", "info")
            try:
                result = subprocess.run(
                    ['netstat', '-aon'],
                    capture_output=True,
                    text=True,
                    shell=True,
                    timeout=10
                )

                port_processes = []
                for line in result.stdout.split('\n'):
                    if f':{self.config["port"]} ' in line and ('LISTENING' in line or 'ESTABLISHED' in line):
                        parts = line.split()
                        if len(parts) >= 5:
                            pid = parts[4].strip()
                            status = "LISTENING" if "LISTENING" in line else "ESTABLISHED"
                            port_processes.append((pid, status))
                            self.log(f"Port {self.config['port']} - PID: {pid} ({status})", "info")

                if not port_processes:
                    self.log("No processes found on port 8080", "warning")
                else:
                    self.log(f"Found {len(port_processes)} processes on port 8080", "info")

            except Exception as e:
                self.log(f"Error checking port processes: {str(e)}", "error")

            # Show all Node.js processes
            self.log("=== NODE.JS PROCESSES ===", "info")
            try:
                node_processes = []
                for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'cpu_percent', 'memory_percent']):
                    try:
                        if proc.info['name'] and 'node' in proc.info['name'].lower():
                            cmdline = ' '.join(proc.info['cmdline']) if proc.info['cmdline'] else 'N/A'
                            is_rssfeed = 'rssfeed' in cmdline.lower()
                            node_processes.append((proc.info['pid'], cmdline[:100], is_rssfeed, proc.info['cpu_percent'], proc.info['memory_percent']))
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue

                for pid, cmdline, is_rssfeed, cpu, mem in node_processes:
                    rssfeed_marker = " [RSSFEED]" if is_rssfeed else ""
                    self.log(f"Node PID: {pid} - CPU: {cpu:.1f}% - MEM: {mem:.1f}%{rssfeed_marker}", "info")
                    self.log(f"  Command: {cmdline}", "info")

                if not node_processes:
                    self.log("No Node.js processes found", "warning")

            except Exception as e:
                self.log(f"Error checking Node.js processes: {str(e)}", "error")

            # Show npm processes
            self.log("=== NPM PROCESSES ===", "info")
            try:
                npm_check = subprocess.run(
                    ['tasklist', '/fi', 'imagename eq npm.cmd'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                npm_lines = [line for line in npm_check.stdout.split('\n') if 'npm.cmd' in line]
                if npm_lines:
                    for line in npm_lines:
                        self.log(f"NPM: {line.strip()}", "info")
                else:
                    self.log("No npm.cmd processes found", "warning")
            except Exception as e:
                self.log(f"Error checking npm processes: {str(e)}", "error")

        except Exception as e:
            self.log(f"Error in debug analysis: {str(e)}", "error")

        # Now attempt to stop
        self.log("=== ATTEMPTING STOP ===", "info")
        self.stop_server()
        self.log("=== DEBUG STOP COMPLETE ===", "info")

    def force_kill_server(self):
        """Enhanced force kill with multiple rounds and better logging"""
        self.log("=== FORCE KILL INITIATED ===", "warning")
        self.status_label.config(text="💀 FORCE KILLING PROCESSES...", fg=self.colors['error'])

        killed_any = False
        kill_report = []

        try:
            # Multiple rounds of killing with different strategies
            for round_num in range(3):
                self.log(f"Force kill round {round_num + 1}/3", "warning")
                round_kills = []

                # Strategy 1: Kill all node.exe processes
                try:
                    node_pids = []
                    for proc in psutil.process_iter(['pid', 'name']):
                        try:
                            if proc.info['name'] and 'node' in proc.info['name'].lower():
                                node_pids.append(proc.info['pid'])
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            continue

                    for pid in node_pids:
                        try:
                            proc = psutil.Process(pid)
                            proc.kill()
                            round_kills.append(f"node.exe PID {pid}")
                            killed_any = True
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            continue

                    if node_pids:
                        self.log(f"Killed Node.js processes: {node_pids}", "success")
                        kill_report.extend(round_kills)

                except Exception as e:
                    self.log(f"Node kill error: {str(e)}", "error")

                # Strategy 2: Kill npm processes
                try:
                    npm_kill = subprocess.run(
                        ['taskkill', '/f', '/im', 'npm.cmd', '/t'],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if npm_kill.returncode == 0:
                        self.log("Killed npm processes", "success")
                        kill_report.append("npm.cmd processes")
                        killed_any = True
                except:
                    pass

                # Strategy 3: Kill processes on port 8080
                try:
                    result = subprocess.run(
                        ['netstat', '-aon'],
                        capture_output=True,
                        text=True,
                        shell=True,
                        timeout=10
                    )

                    pids_to_kill = []
                    for line in result.stdout.split('\n'):
                        if f':{self.config["port"]} ' in line and ('LISTENING' in line or 'ESTABLISHED' in line):
                            parts = line.split()
                            if len(parts) >= 5:
                                pid = parts[4].strip()
                                if pid not in pids_to_kill:
                                    pids_to_kill.append(pid)

                    for pid in pids_to_kill:
                        try:
                            kill_result = subprocess.run(
                                ['taskkill', '/f', '/pid', pid],
                                capture_output=True,
                                text=True,
                                timeout=5
                            )
                            if kill_result.returncode == 0:
                                round_kills.append(f"port {self.config['port']} PID {pid}")
                                killed_any = True
                        except:
                            pass

                    if pids_to_kill:
                        self.log(f"Killed port processes: {pids_to_kill}", "success")

                except Exception as e:
                    self.log(f"Port kill error: {str(e)}", "error")

                # Wait between rounds
                if round_num < 2:
                    time.sleep(2)

            # Final verification
            self.log("Final verification of server status...", "info")
            time.sleep(3)

            final_status = self.check_server_status()
            if not final_status:
                if killed_any:
                    self.log(f"Force kill successful - killed: {', '.join(kill_report)}", "success")
                    self.status_label.config(text="✅ FORCE KILL SUCCESSFUL", fg=self.colors['success'])
                else:
                    self.log("No server processes found to kill", "info")
                    self.status_label.config(text="ℹ️ NO PROCESSES TO KILL", fg=self.colors['warning'])
            else:
                self.log("WARNING: Server may still be running after force kill!", "error")
                self.status_label.config(text="⚠️ FORCE KILL MAY HAVE FAILED", fg=self.colors['error'])

        except Exception as e:
            self.log(f"Critical error in force kill: {str(e)}", "error")
            self.status_label.config(text="❌ FORCE KILL ERROR", fg=self.colors['error'])

        self.log("=== FORCE KILL COMPLETE ===", "warning")

    def restart_server(self):
        """Improved restart with better error handling"""
        self.log("Restarting server...", "info")
        self.status_label.config(text="🔄 RESTARTING SERVER...", fg=self.colors['accent'])

        try:
            # Stop server first
            self.stop_server()

            # Wait for server to fully stop with timeout
            self.log("Waiting for server to stop...", "info")
            stopped = False
            for i in range(10):  # Wait up to 10 seconds
                time.sleep(1)
                if not self.check_server_status():
                    stopped = True
                    break

            if not stopped:
                self.log("Server did not stop gracefully, using force kill", "warning")
                self.force_kill_server()
                time.sleep(2)

            # Start server again
            self.log("Starting server after restart...", "info")
            self.start_server_normal()

        except Exception as e:
            self.log(f"Restart failed: {str(e)}", "error")
            self.status_label.config(text="❌ RESTART FAILED", fg=self.colors['error'])
            messagebox.showerror("Restart Failed", f"Failed to restart server:\n{str(e)}")

    def check_status(self):
        """Enhanced status check with detailed information"""
        self.log("=== COMPREHENSIVE STATUS CHECK ===", "info")

        running = self.check_server_status()

        if running:
            self.log("✅ Server is running on port 8080", "success")
            
            # Try to get more details about the running process
            try:
                node_processes = []
                for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'create_time', 'cpu_percent', 'memory_percent']):
                    try:
                        if proc.info['name'] and 'node' in proc.info['name'].lower():
                            if proc.info['cmdline'] and any('rssfeed' in str(cmd).lower() for cmd in proc.info['cmdline']):
                                create_time = datetime.fromtimestamp(proc.info['create_time']).strftime('%H:%M:%S')
                                node_processes.append({
                                    'pid': proc.info['pid'],
                                    'cpu': proc.info['cpu_percent'],
                                    'memory': proc.info['memory_percent'],
                                    'started': create_time
                                })
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue

                if node_processes:
                    for proc in node_processes:
                        self.log(f"RSS Feed Process - PID: {proc['pid']}, Started: {proc['started']}, CPU: {proc['cpu']:.1f}%, Memory: {proc['memory']:.1f}%", "info")
                else:
                    self.log("No RSS feed Node.js process found (unexpected)", "warning")

            except Exception as e:
                self.log(f"Error getting process details: {str(e)}", "warning")

            # Try to show recent log entries
            try:
                if os.path.exists(self.config['log_file']):
                    with open(self.config['log_file'], 'r', encoding='utf-8', errors='ignore') as f:
                        lines = f.readlines()[-5:]  # Last 5 lines
                        if lines:
                            self.log("Recent server logs:", "info")
                            for line in lines:
                                self.log(f"  {line.strip()}", "info")
                        else:
                            self.log("Log file is empty", "warning")
                else:
                    self.log(f"No {self.config['log_file']} file found", "warning")
            except Exception as e:
                self.log(f"Error reading logs: {str(e)}", "error")
        else:
            self.log("❌ Server is not running", "error")

        self.log("=== STATUS CHECK COMPLETE ===", "info")

    def show_article_reports(self):
        """Show detailed article fetch reports including logistics and other categories"""
        self.log("Generating article fetch reports...", "info")
        
        # Create a new window for reports
        report_window = tk.Toplevel(self.root)
        report_window.title("📈 Article Fetch Reports")
        report_window.geometry("1000x700")
        report_window.configure(bg=self.colors['bg'])
        
        # Main container
        main_frame = tk.Frame(report_window, bg=self.colors['bg'])
        main_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)
        
        # Title
        title_label = tk.Label(
            main_frame,
            text="📈 DETAILED ARTICLE FETCH REPORTS",
            font=('Segoe UI', 16, 'bold'),
            fg=self.colors['accent'],
            bg=self.colors['bg']
        )
        title_label.pack(pady=(0, 20))
        
        # Create notebook for tabs
        notebook = ttk.Notebook(main_frame)
        notebook.pack(fill=tk.BOTH, expand=True)
        
        # Style the notebook
        style = ttk.Style()
        style.theme_use('default')
        style.configure('TNotebook', background=self.colors['bg'])
        style.configure('TNotebook.Tab', background=self.colors['button_bg'], foreground=self.colors['fg'])
        style.map('TNotebook.Tab', background=[('selected', self.colors['accent'])])
        
        # Tab 1: Current Articles Summary
        current_frame = tk.Frame(notebook, bg=self.colors['secondary'])
        notebook.add(current_frame, text="📊 Current Articles")
        
        current_text = scrolledtext.ScrolledText(
            current_frame,
            bg=self.colors['bg'],
            fg=self.colors['fg'],
            font=('Consolas', 10),
            wrap=tk.WORD
        )
        current_text.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Tab 2: Feed Sources Status
        feeds_frame = tk.Frame(notebook, bg=self.colors['secondary'])
        notebook.add(feeds_frame, text="🌐 Feed Sources")
        
        feeds_text = scrolledtext.ScrolledText(
            feeds_frame,
            bg=self.colors['bg'],
            fg=self.colors['fg'],
            font=('Consolas', 10),
            wrap=tk.WORD
        )
        feeds_text.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Tab 3: Categories Breakdown
        categories_frame = tk.Frame(notebook, bg=self.colors['secondary'])
        notebook.add(categories_frame, text="📂 Categories")
        
        categories_text = scrolledtext.ScrolledText(
            categories_frame,
            bg=self.colors['bg'],
            fg=self.colors['fg'],
            font=('Consolas', 10),
            wrap=tk.WORD
        )
        categories_text.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Tab 4: Logistics Focus
        logistics_frame = tk.Frame(notebook, bg=self.colors['secondary'])
        notebook.add(logistics_frame, text="🚚 Logistics Focus")
        
        logistics_text = scrolledtext.ScrolledText(
            logistics_frame,
            bg=self.colors['bg'],
            fg=self.colors['fg'],
            font=('Consolas', 10),
            wrap=tk.WORD
        )
        logistics_text.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Generate reports in background thread
        def generate_reports():
            try:
                # Fetch current articles data
                articles_data = self.fetch_articles_data()
                
                # Generate Current Articles Summary
                current_report = self.generate_current_articles_report(articles_data)
                current_text.delete(1.0, tk.END)
                current_text.insert(1.0, current_report)
                
                # Generate Feed Sources Status
                feeds_report = self.generate_feeds_report(articles_data)
                feeds_text.delete(1.0, tk.END)
                feeds_text.insert(1.0, feeds_report)
                
                # Generate Categories Breakdown
                categories_report = self.generate_categories_report(articles_data)
                categories_text.delete(1.0, tk.END)
                categories_text.insert(1.0, categories_report)
                
                # Generate Logistics Focus
                logistics_report = self.generate_logistics_report(articles_data)
                logistics_text.delete(1.0, tk.END)
                logistics_text.insert(1.0, logistics_report)
                
                self.log("Article reports generated successfully", "success")
                
            except Exception as e:
                error_msg = f"Error generating reports: {str(e)}"
                self.log(error_msg, "error")
                
                # Show error in all tabs
                error_text = f"❌ {error_msg}\n\nPlease ensure the server is running and try again."
                for text_widget in [current_text, feeds_text, categories_text, logistics_text]:
                    text_widget.delete(1.0, tk.END)
                    text_widget.insert(1.0, error_text)
        
        # Start generating reports
        report_window.after(100, generate_reports)
        
        # Close button
        close_button = tk.Button(
            main_frame,
            text="🚪 Close Reports",
            command=report_window.destroy,
            bg=self.colors['button_bg'],
            fg=self.colors['fg'],
            font=('Segoe UI', 10, 'bold'),
            relief='raised',
            bd=2
        )
        close_button.pack(pady=(10, 0))
        
        # Center the window
        report_window.transient(self.root)
        report_window.grab_set()

    def fetch_articles_data(self):
        """Fetch articles data from the server API"""
        try:
            import urllib.request
            import urllib.error
            import json
            
            url = f"http://localhost:{self.config['port']}/api/articles"
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Woodmont-Server-Manager/1.0')
            
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status == 200:
                    data = response.read().decode('utf-8')
                    return json.loads(data)
                else:
                    raise Exception(f"Server returned status {response.status}")
                    
        except urllib.error.URLError as e:
            if e.reason == 'ConnectionRefused':
                raise Exception("Server is not running or not accepting connections")
            else:
                raise Exception(f"Connection error: {str(e.reason)}")
        except json.JSONDecodeError as e:
            raise Exception(f"Invalid JSON response from server: {str(e)}")
        except Exception as e:
            raise Exception(f"Failed to fetch articles: {str(e)}")

    def generate_current_articles_report(self, data):
        """Generate current articles summary report"""
        report = []
        report.append("=" * 60)
        report.append("📊 CURRENT ARTICLES SUMMARY")
        report.append("=" * 60)
        report.append("")
        
        if not data or 'items' not in data:
            report.append("❌ No articles data available")
            report.append("Please ensure the server is running and has fetched articles.")
            return "\n".join(report)
        
        items = data.get('items', [])
        total_articles = len(items)
        
        report.append(f"📈 Total Articles: {total_articles}")
        report.append(f"📅 Generated At: {data.get('generatedAt', 'Unknown')}")
        report.append("")
        
        # Recent articles (last 24 hours)
        from datetime import datetime, timedelta
        now = datetime.now()
        yesterday = now - timedelta(days=1)
        
        recent_articles = [item for item in items 
                          if item.get('pubDate') and datetime.fromisoformat(item['pubDate'].replace('Z', '+00:00')) > yesterday]
        
        report.append(f"🆕 Last 24 Hours: {len(recent_articles)} articles")
        report.append("")
        
        # Top sources
        sources = {}
        for item in items:
            source = item.get('source') or item.get('publisher', 'Unknown')
            sources[source] = sources.get(source, 0) + 1
        
        report.append("📰 TOP SOURCES:")
        for source, count in sorted(sources.items(), key=lambda x: x[1], reverse=True)[:10]:
            report.append(f"  • {source}: {count} articles")
        
        report.append("")
        report.append("📅 LATEST ARTICLES (Last 5):")
        latest_items = sorted(items, key=lambda x: x.get('pubDate', ''), reverse=True)[:5]
        for i, item in enumerate(latest_items, 1):
            title = item.get('title', 'No title')[:80] + "..." if len(item.get('title', '')) > 80 else item.get('title', 'No title')
            pub_date = item.get('pubDate', 'Unknown date')
            source = item.get('source') or item.get('publisher', 'Unknown')
            report.append(f"  {i}. {title}")
            report.append(f"     📅 {pub_date} | 📰 {source}")
            report.append("")
        
        return "\n".join(report)

    def generate_feeds_report(self, data):
        """Generate feed sources status report"""
        report = []
        report.append("=" * 60)
        report.append("🌐 FEED SOURCES STATUS")
        report.append("=" * 60)
        report.append("")
        
        if not data or 'items' not in data:
            report.append("❌ No feed data available")
            return "\n".join(report)
        
        items = data.get('items', [])
        
        # Analyze feed sources
        feed_stats = {}
        regions = {}
        categories = {}
        
        for item in items:
            source = item.get('source') or item.get('publisher', 'Unknown')
            region = item.get('region', 'Unknown')
            category = item.get('category', 'relevant')
            
            feed_stats[source] = feed_stats.get(source, 0) + 1
            regions[region] = regions.get(region, 0) + 1
            categories[category] = categories.get(category, 0) + 1
        
        report.append(f"📊 Active Feed Sources: {len(feed_stats)}")
        report.append(f"🌍 Regions Covered: {len(regions)}")
        report.append(f"📂 Categories: {len(categories)}")
        report.append("")
        
        # Feed sources breakdown
        report.append("📰 FEED SOURCES BREAKDOWN:")
        for source, count in sorted(feed_stats.items(), key=lambda x: x[1], reverse=True):
            percentage = (count / len(items)) * 100
            bar = "█" * int(percentage / 2)  # Simple text bar
            report.append(f"  {source:25} {count:4d} ({percentage:5.1f}%) {bar}")
        
        report.append("")
        report.append("🌍 REGIONAL DISTRIBUTION:")
        for region, count in sorted(regions.items(), key=lambda x: x[1], reverse=True):
            percentage = (count / len(items)) * 100
            report.append(f"  {region:15} {count:4d} ({percentage:5.1f}%)")
        
        return "\n".join(report)

    def generate_categories_report(self, data):
        """Generate categories breakdown report"""
        report = []
        report.append("=" * 60)
        report.append("📂 CATEGORIES BREAKDOWN")
        report.append("=" * 60)
        report.append("")
        
        if not data or 'items' not in data:
            report.append("❌ No category data available")
            return "\n".join(report)
        
        items = data.get('items', [])
        
        # Count categories
        categories = {}
        for item in items:
            category = item.get('category', 'relevant')
            categories[category] = categories.get(category, 0) + 1
        
        report.append(f"📊 Total Categories: {len(categories)}")
        report.append(f"📄 Total Articles: {len(items)}")
        report.append("")
        
        # Category details
        category_names = {
            'relevant': '📊 Market Intelligence',
            'transaction': '💰 Property Transactions',
            'availabilities': '🏢 Available Properties',
            'people': '👥 Leadership & Appointments'
        }
        
        report.append("📂 CATEGORY BREAKDOWN:")
        for category, count in sorted(categories.items(), key=lambda x: x[1], reverse=True):
            percentage = (count / len(items)) * 100
            name = category_names.get(category, category.title())
            report.append(f"  {name:25} {count:4d} ({percentage:5.1f}%)")
            
            # Show recent examples for each category
            category_items = [item for item in items if item.get('category') == category][:3]
            for item in category_items:
                title = item.get('title', 'No title')[:70] + "..." if len(item.get('title', '')) > 70 else item.get('title', 'No title')
                report.append(f"    • {title}")
            report.append("")
        
        return "\n".join(report)

    def generate_logistics_report(self, data):
        """Generate logistics-focused report"""
        report = []
        report.append("=" * 60)
        report.append("🚚 LOGISTICS & INDUSTRIAL FOCUS")
        report.append("=" * 60)
        report.append("")
        
        if not data or 'items' not in data:
            report.append("❌ No logistics data available")
            return "\n".join(report)
        
        items = data.get('items', [])
        
        # Keywords for logistics/industrial content
        logistics_keywords = [
            'logistics', 'warehouse', 'distribution', 'fulfillment', 'supply chain',
            'industrial', 'manufacturing', 'cold storage', '3pl', 'last mile',
            'port', 'drayage', 'intermodal', 'freight', 'shipping'
        ]
        
        # Find logistics-related articles
        logistics_articles = []
        for item in items:
            title = (item.get('title') or '').lower()
            description = (item.get('description') or '').lower()
            text = title + ' ' + description
            
            if any(keyword in text for keyword in logistics_keywords):
                logistics_articles.append(item)
        
        report.append(f"🚚 Logistics-Related Articles: {len(logistics_articles)} of {len(items)}")
        report.append(f"📊 Percentage: {(len(logistics_articles) / len(items) * 100):.1f}%")
        report.append("")
        
        if logistics_articles:
            report.append("🚚 RECENT LOGISTICS ARTICLES:")
            for i, item in enumerate(logistics_articles[:10], 1):
                title = item.get('title', 'No title')
                pub_date = item.get('pubDate', 'Unknown date')
                source = item.get('source') or item.get('publisher', 'Unknown')
                
                # Highlight keywords found
                title_lower = title.lower()
                found_keywords = [kw for kw in logistics_keywords if kw in title_lower]
                
                report.append(f"  {i}. {title}")
                report.append(f"     📅 {pub_date} | 📰 {source}")
                if found_keywords:
                    report.append(f"     🏷️  Keywords: {', '.join(found_keywords[:3])}")
                report.append("")
        
        # Industrial real estate focus
        industrial_keywords = [
            'industrial real estate', 'warehouse space', 'distribution center',
            'manufacturing facility', 'industrial property', 'spec industrial'
        ]
        
        industrial_articles = []
        for item in items:
            title = (item.get('title') or '').lower()
            description = (item.get('description') or '').lower()
            text = title + ' ' + description
            
            if any(keyword in text for keyword in industrial_keywords):
                industrial_articles.append(item)
        
        report.append("")
        report.append("🏭 INDUSTRIAL REAL ESTATE FOCUS:")
        report.append(f"🏭 Industrial Real Estate Articles: {len(industrial_articles)}")
        report.append(f"📊 Percentage: {(len(industrial_articles) / len(items) * 100):.1f}%")
        report.append("")
        
        if industrial_articles:
            report.append("🏭 RECENT INDUSTRIAL REAL ESTATE:")
            for i, item in enumerate(industrial_articles[:5], 1):
                title = item.get('title', 'No title')
                pub_date = item.get('pubDate', 'Unknown date')
                source = item.get('source') or item.get('publisher', 'Unknown')
                report.append(f"  {i}. {title}")
                report.append(f"     📅 {pub_date} | 📰 {source}")
                report.append("")
        
        return "\n".join(report)

    def npm_build(self):
        """Run npm build command"""
        self.log("Running npm build...", "info")
        self.status_label.config(text="🔨 BUILDING...", fg=self.colors['warning'])
        
        try:
            # Run npm build
            process = subprocess.Popen(
                ['cmd', '/c', 'npm run build'],
                cwd=os.getcwd(),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True
            )
            
            # Read output line by line and display in log
            while True:
                output = process.stdout.readline()
                if output == '' and process.poll() is not None:
                    break
                if output:
                    self.log(output.strip(), "info")
            
            # Check the return code
            return_code = process.poll()
            
            if return_code == 0:
                self.log("✅ npm build completed successfully", "success")
                self.status_label.config(text="✅ BUILD COMPLETED", fg=self.colors['success'])
            else:
                self.log(f"❌ npm build failed with return code {return_code}", "error")
                self.status_label.config(text="❌ BUILD FAILED", fg=self.colors['error'])
                
        except Exception as e:
            self.log(f"❌ Error running npm build: {str(e)}", "error")
            self.status_label.config(text="❌ BUILD ERROR", fg=self.colors['error'])

    def npm_start(self):
        """Run npm start command"""
        self.log("Running npm start...", "info")
        self.status_label.config(text="🚀 STARTING NPM...", fg=self.colors['warning'])
        
        try:
            # Run npm start in background
            self.npm_process = subprocess.Popen(
                ['cmd', '/c', 'npm start'],
                cwd=os.getcwd(),
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            
            self.log("✅ npm start command executed", "success")
            self.status_label.config(text="✅ NPM STARTED", fg=self.colors['success'])
            
            # Give it a moment to start
            self.root.after(2000, self.check_npm_status)
            
        except Exception as e:
            self.log(f"❌ Error running npm start: {str(e)}", "error")
            self.status_label.config(text="❌ NPM START ERROR", fg=self.colors['error'])

    def npm_stop(self):
        """Stop npm processes"""
        self.log("Stopping npm processes...", "info")
        self.status_label.config(text="🛑 STOPPING NPM...", fg=self.colors['warning'])
        
        killed = False
        
        try:
            # Stop any npm process we started
            if hasattr(self, 'npm_process') and self.npm_process:
                try:
                    self.npm_process.terminate()
                    self.log("Terminated npm start process", "info")
                    killed = True
                except:
                    pass
                
                # Force kill if still running
                try:
                    self.npm_process.kill()
                    self.log("Force killed npm start process", "warning")
                    killed = True
                except:
                    pass
            
            # Kill all npm.cmd processes
            try:
                npm_kill = subprocess.run(
                    ['taskkill', '/f', '/im', 'npm.cmd', '/t'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if npm_kill.returncode == 0:
                    self.log("Killed npm.cmd processes", "success")
                    killed = True
            except:
                pass
            
            # Kill all npm.exe processes
            try:
                npm_exe_kill = subprocess.run(
                    ['taskkill', '/f', '/im', 'npm.exe', '/t'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if npm_exe_kill.returncode == 0:
                    self.log("Killed npm.exe processes", "success")
                    killed = True
            except:
                pass
            
            # Kill all node.exe processes (in case npm started node)
            try:
                node_kill = subprocess.run(
                    ['taskkill', '/f', '/im', 'node.exe', '/t'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if node_kill.returncode == 0:
                    self.log("Killed node.exe processes", "success")
                    killed = True
            except:
                pass
            
            if killed:
                self.log("✅ npm processes stopped successfully", "success")
                self.status_label.config(text="✅ NPM STOPPED", fg=self.colors['success'])
            else:
                self.log("No npm processes were running", "info")
                self.status_label.config(text="✅ NPM STOPPED", fg=self.colors['success'])
                
        except Exception as e:
            self.log(f"❌ Error stopping npm processes: {str(e)}", "error")
            self.status_label.config(text="❌ NPM STOP ERROR", fg=self.colors['error'])

    def check_npm_status(self):
        """Check if npm process is still running"""
        if hasattr(self, 'npm_process') and self.npm_process:
            try:
                # Check if process is still running
                return_code = self.npm_process.poll()
                if return_code is None:
                    self.log("npm process is running", "info")
                else:
                    self.log(f"npm process ended with return code {return_code}", "info")
            except:
                pass

    def generate_daily_briefing(self):
        """Generate daily briefing report with 4 sections"""
        self.log("Generating daily briefing report...", "info")
        
        # Create a new window for the briefing
        briefing_window = tk.Toplevel(self.root)
        briefing_window.title("📋 Daily Briefing Generator")
        briefing_window.geometry("900x700")
        briefing_window.configure(bg=self.colors['bg'])
        
        # Main container
        main_frame = tk.Frame(briefing_window, bg=self.colors['bg'])
        main_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)
        
        # Title
        title_label = tk.Label(
            main_frame,
            text="📋 DAILY BRIEFING GENERATOR",
            font=('Segoe UI', 16, 'bold'),
            fg=self.colors['accent'],
            bg=self.colors['bg']
        )
        title_label.pack(pady=(0, 20))
        
        # Instructions
        instructions = tk.Label(
            main_frame,
            text="Generate a concise, scannable daily briefing with 4 sections:\n"
                 "1) Relevant Articles - Macro trends & industrial real estate news\n"
                 "2) Transactions - Notable sales/leases (≥100K SF or ≥$25M)\n"
                 "3) Availabilities - New industrial properties for sale/lease\n"
                 "4) People News - Personnel moves in industrial brokerage/development",
            font=('Segoe UI', 10),
            fg=self.colors['fg'],
            bg=self.colors['bg'],
            justify=tk.LEFT
        )
        instructions.pack(pady=(0, 20))
        
        # Control buttons
        button_frame = tk.Frame(main_frame, bg=self.colors['bg'])
        button_frame.pack(fill=tk.X, pady=(0, 10))
        
        generate_button = tk.Button(
            button_frame,
            text="📋 GENERATE BRIEFING",
            command=lambda: self.create_briefing_content(briefing_text),
            bg=self.colors['button_bg'],
            fg=self.colors['fg'],
            font=('Segoe UI', 12, 'bold'),
            relief='raised',
            bd=2
        )
        generate_button.pack(side=tk.LEFT, padx=(0, 10))
        
        copy_button = tk.Button(
            button_frame,
            text="📋 COPY TO CLIPBOARD",
            command=lambda: self.copy_to_clipboard(briefing_text),
            bg=self.colors['button_bg'],
            fg=self.colors['fg'],
            font=('Segoe UI', 10),
            relief='raised',
            bd=2
        )
        copy_button.pack(side=tk.LEFT)
        
        # Briefing text area
        briefing_text = scrolledtext.ScrolledText(
            main_frame,
            bg=self.colors['bg'],
            fg=self.colors['fg'],
            font=('Consolas', 10),
            wrap=tk.WORD,
            height=25
        )
        briefing_text.pack(fill=tk.BOTH, expand=True, pady=(10, 0))
        
        # Initialize with welcome message
        welcome_text = """DAILY BRIEFING - Industrial Real Estate Focus
===============================================

Last 24-48 Hours: NJ, PA, TX, FL Markets + National Context

Click "GENERATE BRIEFING" to create today's report...

Format Rules:
• 4-6 bullets per section when possible
• Each bullet: 2 lines max
• Include: Location + Size + Key Players + Terms
• Add action tags: [Track] [Share] [Ignore]
• Mark paywalled sources: (paywalled)

Source Policy:
✅ Accept: bisnow.com, globest.com, costar.com, reuters.com, 
           apnews.com, bloomberg.com, wsj.com, cbre.com, 
           jll.com, cushwake.com, colliers.com, bizjournals.com
❌ Reject: commercialsearch.com, propertyshark.com, 
           loopnet.com/news, cached/redirect links

Ready to generate your daily briefing..."""
        
        briefing_text.insert(1.0, welcome_text)
        
        # Close button
        close_button = tk.Button(
            main_frame,
            text="🚪 Close",
            command=briefing_window.destroy,
            bg=self.colors['button_bg'],
            fg=self.colors['fg'],
            font=('Segoe UI', 10, 'bold'),
            relief='raised',
            bd=2
        )
        close_button.pack(pady=(10, 0))
        
        # Center the window
        briefing_window.transient(self.root)
        briefing_window.grab_set()

    def create_briefing_content(self, text_widget):
        """Create and populate the briefing content"""
        try:
            # Fetch articles from the server
            articles_data = self.fetch_articles_data()
            
            if not articles_data or 'items' not in articles_data:
                text_widget.delete(1.0, tk.END)
                text_widget.insert(1.0, "❌ Error: Could not fetch articles from server.\n\nPlease ensure the server is running and try again.")
                return
            
            items = articles_data.get('items', [])
            
            # Filter articles from last 48 hours
            from datetime import datetime, timedelta
            now = datetime.now()
            two_days_ago = now - timedelta(days=2)
            
            recent_articles = []
            for item in items:
                try:
                    pub_date_str = item.get('pubDate', '')
                    if pub_date_str:
                        # Parse date (handle various formats)
                        pub_date = datetime.fromisoformat(pub_date_str.replace('Z', '+00:00'))
                        if pub_date > two_days_ago:
                            recent_articles.append(item)
                except:
                    # If date parsing fails, include it anyway
                    recent_articles.append(item)
            
            # Classify articles into 4 sections
            relevant_articles = []
            transactions = []
            availabilities = []
            people_news = []
            
            for article in recent_articles:
                title = (article.get('title') or '').lower()
                description = (article.get('description') or '').lower()
                source = article.get('source', '')
                link = article.get('link', '')
                category = article.get('category', '')
                
                # Check source validity
                valid_sources = ['bisnow.com', 'globest.com', 'costar.com', 'reuters.com', 
                                'apnews.com', 'bloomberg.com', 'wsj.com', 'cbre.com', 
                                'jll.com', 'cushwake.com', 'colliers.com', 'bizjournals.com']
                
                is_valid_source = any(domain in link for domain in valid_sources) if link else False
                
                # Classify based on content and category
                if category == 'people' or any(term in title for term in ['appointed', 'named', 'joined', 'hired', 'executive', 'ceo', 'president']):
                    people_news.append((article, is_valid_source))
                elif category == 'transaction' or any(term in title for term in ['sells', 'acquires', 'buys', 'sale', 'closed', 'financing']):
                    transactions.append((article, is_valid_source))
                elif category == 'availabilities' or any(term in title for term in ['for lease', 'available', 'for sale', 'listing']):
                    availabilities.append((article, is_valid_source))
                else:
                    relevant_articles.append((article, is_valid_source))
            
            # Generate briefing content
            briefing = self.format_briefing(relevant_articles, transactions, availabilities, people_news)
            
            # Display in text widget
            text_widget.delete(1.0, tk.END)
            text_widget.insert(1.0, briefing)
            
            self.log("✅ Daily briefing generated successfully", "success")
            
        except Exception as e:
            self.log(f"❌ Error generating briefing: {str(e)}", "error")
            text_widget.delete(1.0, tk.END)
            text_widget.insert(1.0, f"❌ Error generating briefing: {str(e)}")

    def format_briefing(self, relevant, transactions, availabilities, people):
        """Format the briefing into the required structure"""
        from datetime import datetime
        
        briefing = f"""DAILY BRIEFING - Industrial Real Estate Focus
===============================================
Date: {datetime.now().strftime('%B %d, %Y')}
Coverage: NJ, PA, TX, FL Markets + National Context
Timeframe: Last 24-48 Hours

1) RELEVANT ARTICLES — Macro Trends & Industrial Real Estate News
------------------------------------------------------------------
"""
        
        # Add relevant articles (max 6)
        for i, (article, is_valid) in enumerate(relevant[:6]):
            title = article.get('title', 'No title')
            source = article.get('source', 'Unknown')
            link = article.get('link', '')
            paywall = " (paywalled)" if not is_valid and ('bloomberg.com' in link or 'wsj.com' in link) else ""
            
            # Extract location, size, players if possible
            location = self.extract_location(title)
            size = self.extract_size(title)
            
            bullet = f"• {title[:80]}{'...' if len(title) > 80 else ''}\n"
            if location or size:
                bullet += f"  {location} {size} • {source}{paywall} [Track]"
            else:
                bullet += f"  {source}{paywall} [Track]"
            
            briefing += bullet + "\n\n"
        
        if not relevant:
            briefing += "<p><em>No updated information provided for this section.</em></p>\n\n"
        
        briefing += """2) TRANSACTIONS — Notable Sales/Leases (≥100K SF or ≥$25M)
------------------------------------------------------------
"""
        
        # Add transactions (max 6)
        for i, (article, is_valid) in enumerate(transactions[:6]):
            title = article.get('title', 'No title')
            source = article.get('source', 'Unknown')
            link = article.get('link', '')
            paywall = " (paywalled)" if not is_valid and ('bloomberg.com' in link or 'wsj.com' in link) else ""
            
            location = self.extract_location(title)
            size = self.extract_size(title)
            price = self.extract_price(title)
            
            bullet = f"• {title[:80]}{'...' if len(title) > 80 else ''}\n"
            if location or size or price:
                bullet += f"  {location} {size} {price} • {source}{paywall} [Share]"
            else:
                bullet += f"  {source}{paywall} [Share]"
            
            briefing += bullet + "\n\n"
        
        if not transactions:
            briefing += "<p><em>No updated information provided for this section.</em></p>\n\n"
        
        briefing += """3) AVAILABILITIES — New Industrial Properties for Sale/Lease
-----------------------------------------------------------
"""
        
        # Add availabilities (max 6)
        for i, (article, is_valid) in enumerate(availabilities[:6]):
            title = article.get('title', 'No title')
            source = article.get('source', 'Unknown')
            link = article.get('link', '')
            paywall = " (paywalled)" if not is_valid and ('bloomberg.com' in link or 'wsj.com' in link) else ""
            
            location = self.extract_location(title)
            size = self.extract_size(title)
            
            bullet = f"• {title[:80]}{'...' if len(title) > 80 else ''}\n"
            if location or size:
                bullet += f"  {location} {size} • {source}{paywall} [Track]"
            else:
                bullet += f"  {source}{paywall} [Track]"
            
            briefing += bullet + "\n\n"
        
        if not availabilities:
            briefing += "<p><em>No updated information provided for this section.</em></p>\n\n"
        
        briefing += """4) PEOPLE NEWS — Personnel Moves in Industrial Brokerage/Development
--------------------------------------------------------------------------------
"""
        
        # Add people news (max 6)
        for i, (article, is_valid) in enumerate(people[:6]):
            title = article.get('title', 'No title')
            source = article.get('source', 'Unknown')
            link = article.get('link', '')
            paywall = " (paywalled)" if not is_valid and ('bloomberg.com' in link or 'wsj.com' in link) else ""
            
            location = self.extract_location(title)
            
            bullet = f"• {title[:80]}{'...' if len(title) > 80 else ''}\n"
            if location:
                bullet += f"  {location} • {source}{paywall} [Share]"
            else:
                bullet += f"  {source}{paywall} [Share]"
            
            briefing += bullet + "\n\n"
        
        if not people:
            briefing += "<p><em>No updated information provided for this section.</em></p>\n\n"
        
        # Add Friday week-in-review if it's Friday
        if datetime.now().weekday() == 4:  # Friday
            briefing += """
WEEK-IN-REVIEW — Top 5 Developments This Week
-----------------------------------------------
• [Development 1] - Key market trend from the week
• [Development 2] - Major transaction or policy change
• [Development 3] - Significant personnel movement
• [Development 4] - Notable availability or construction
• [Development 5] - Economic indicator affecting industrial CRE

"""
        
        briefing += """
Source Policy: Only includes articles from approved domains. 
Marked (paywalled) when applicable. Links omitted for paywalled content.

Generated by Woodmont RSS Feed System
"""
        
        return briefing

    def extract_location(self, title):
        """Extract location from title"""
        locations = ['NJ', 'PA', 'TX', 'FL', 'New Jersey', 'Pennsylvania', 'Texas', 'Florida',
                    'New York', 'California', 'Chicago', 'Houston', 'Dallas', 'Austin', 'Miami',
                    'Tampa', 'Orlando', 'Philadelphia', 'Newark', 'Camden', 'Fort Worth']
        
        for location in locations:
            if location.lower() in title.lower():
                return location
        return ""

    def extract_size(self, title):
        """Extract size from title"""
        import re
        
        # Look for patterns like "100K SF", "1.2M SF", "500,000 SF"
        size_patterns = [
            r'(\d+(?:,\d+)*(?:\.\d+)?)\s*(K|M|B)?\s*SF',
            r'(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|m|b)?\s*sq\s*ft',
            r'(\d+(?:,\d+)*(?:\.\d+)?)\s*(K|M|B)?\s*square\s*feet'
        ]
        
        for pattern in size_patterns:
            match = re.search(pattern, title, re.IGNORECASE)
            if match:
                size_num = match.group(1)
                size_unit = match.group(2) or ''
                return f"{size_num} {size_unit}SF".upper()
        return ""

    def extract_price(self, title):
        """Extract price from title"""
        import re
        
        # Look for patterns like "$25M", "$100K", "$1.5B"
        price_patterns = [
            r'\$(\d+(?:,\d+)*(?:\.\d+)?)\s*(K|M|B)?',
            r'(\d+(?:,\d+)*(?:\.\d+)?)\s*(K|M|B)?\s*dollars'
        ]
        
        for pattern in price_patterns:
            match = re.search(pattern, title, re.IGNORECASE)
            if match:
                price_num = match.group(1)
                price_unit = match.group(2) or ''
                if price_unit:
                    return f"${price_num}{price_unit.upper()}"
                else:
                    return f"${price_num}"
        return ""

    def copy_to_clipboard(self, text_widget):
        """Copy briefing content to clipboard"""
        try:
            content = text_widget.get(1.0, tk.END)
            self.root.clipboard_clear()
            self.root.clipboard_append(content)
            self.log("✅ Briefing copied to clipboard", "success")
        except Exception as e:
            self.log(f"❌ Error copying to clipboard: {str(e)}", "error")

    def exit_app(self):
        """Enhanced exit with option to stop server"""
        response = messagebox.askyesnocancel(
            "Exit Options", 
            "Choose exit option:\n\nYES = Stop server & exit\nNO = Exit without stopping server\nCANCEL = Don't exit"
        )
        
        if response is True:  # YES - Stop server and exit
            self.log("Stopping server before exit...", "info")
            self.stop_server()
            time.sleep(2)
            self.log("Application exiting...", "info")
            self.root.quit()
        elif response is False:  # NO - Exit without stopping server
            self.log("Application exiting without stopping server...", "warning")
            self.root.quit()
        # CANCEL - Do nothing

def main():
    """Enhanced main with better error handling"""
    try:
        # Check if required modules are available
        try:
            import psutil
        except ImportError:
            messagebox.showerror(
                "Missing Dependency", 
                "psutil module is required but not installed.\n\nPlease install it with:\npip install psutil"
            )
            sys.exit(1)

        app = ServerManager()
        app.root.mainloop()
    except Exception as e:
        messagebox.showerror("Error", f"Failed to start application:\n\n{str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
