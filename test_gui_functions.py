#!/usr/bin/env python3
"""
Test script to verify GUI server management functions work
"""

import subprocess
import time
import os

def check_server_status():
    """Check if server is running on port 8080"""
    try:
        result = subprocess.run(
            ['netstat', '-an'],
            capture_output=True,
            text=True,
            shell=True
        )
        return ':8080 ' in result.stdout and 'LISTENING' in result.stdout
    except:
        return False

def test_server_start():
    """Test starting the server"""
    print("Testing server start...")

    if check_server_status():
        print("❌ Server already running")
        return False

    try:
        # Start server with NO_BROWSER to avoid popup
        env = os.environ.copy()
        env['NO_BROWSER'] = 'true'

        process = subprocess.Popen(
            ['cmd', '/c', 'npm start'],
            cwd=os.getcwd(),
            env=env,
            creationflags=subprocess.CREATE_NO_WINDOW
        )

        print("Server process started, waiting for port 8080...")

        # Wait up to 10 seconds for server to start
        for i in range(10):
            time.sleep(1)
            if check_server_status():
                print("✅ Server started successfully!")
                return True

        print("❌ Server process started but not listening on port 8080")
        return False

    except Exception as e:
        print(f"❌ Failed to start server: {str(e)}")
        return False

def test_server_stop():
    """Test stopping the server"""
    print("Testing server stop...")

    if not check_server_status():
        print("ℹ️ No server running to stop")
        return True

    try:
        # Find and kill process on port 8080
        result = subprocess.run(
            ['netstat', '-aon'],
            capture_output=True,
            text=True,
            shell=True
        )

        killed = False
        for line in result.stdout.split('\n'):
            if ':8080 ' in line and 'LISTENING' in line:
                parts = line.split()
                if len(parts) >= 5:
                    pid = parts[4].strip()
                    try:
                        kill_result = subprocess.run(
                            ['taskkill', '/f', '/pid', pid],
                            capture_output=True,
                            text=True
                        )
                        if kill_result.returncode == 0:
                            print(f"✅ Server process {pid} stopped successfully")
                            killed = True
                        else:
                            print(f"❌ Failed to kill process {pid}")
                    except Exception as e:
                        print(f"❌ Error killing process {pid}: {str(e)}")

        # Also kill node processes
        try:
            node_kill = subprocess.run(
                ['taskkill', '/f', '/im', 'node.exe'],
                capture_output=True,
                text=True
            )
            if 'SUCCESS' in node_kill.stdout or node_kill.returncode == 0:
                print("✅ Killed Node.js processes")
                killed = True
        except:
            pass

        if killed:
            # Wait and verify server is stopped
            time.sleep(2)
            if not check_server_status():
                print("✅ Server confirmed stopped")
                return True
            else:
                print("⚠️ Server may still be running")
                return False
        else:
            print("❌ No processes were killed")
            return False

    except Exception as e:
        print(f"❌ Error stopping server: {str(e)}")
        return False

if __name__ == "__main__":
    print("=== GUI Server Management Function Tests ===\n")

    # Test 1: Stop any existing server
    print("1. Cleaning up any existing server...")
    test_server_stop()
    time.sleep(2)

    # Test 2: Start server
    print("\n2. Testing server start...")
    start_success = test_server_start()
    time.sleep(2)

    # Test 3: Stop server
    print("\n3. Testing server stop...")
    stop_success = test_server_stop()

    # Summary
    print("
=== Test Results ===")
    print(f"Server Start: {'✅ PASS' if start_success else '❌ FAIL'}")
    print(f"Server Stop: {'✅ PASS' if stop_success else '❌ FAIL'}")

    if start_success and stop_success:
        print("\n🎉 All tests passed! GUI server management should work.")
    else:
        print("\n❌ Some tests failed. Check the error messages above.")

    print("\nYou can now run: py server_manager.py")
