#!/usr/bin/env python3
"""
Simple test GUI to check if tkinter works
"""

import tkinter as tk
from tkinter import messagebox

def show_message():
    messagebox.showinfo("Test", "GUI is working!")

root = tk.Tk()
root.title("Test GUI")
root.geometry("300x200")

label = tk.Label(root, text="If you can see this, GUI works!")
label.pack(pady=20)

button = tk.Button(root, text="Click me", command=show_message)
button.pack(pady=10)

root.mainloop()
